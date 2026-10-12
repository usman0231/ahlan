import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo push delivery.
 *
 * Tokens that Expo reports as unregistered are deleted: a stale token on a
 * reinstalled phone otherwise keeps failing on every single notification.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendToUser(
    userId: string,
    message: { title: string; body: string; data?: Record<string, string> },
  ): Promise<number> {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (tokens.length === 0) return 0;
    return this.sendToTokens(
      tokens.map((row) => row.token),
      message,
    );
  }

  async sendToTokens(
    tokens: string[],
    message: { title: string; body: string; data?: Record<string, string> },
  ): Promise<number> {
    let delivered = 0;

    for (let offset = 0; offset < tokens.length; offset += BATCH_SIZE) {
      const batch = tokens.slice(offset, offset + BATCH_SIZE);
      const payload = batch.map((token) => ({
        to: token,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        sound: 'default' as const,
        priority: 'high' as const,
        channelId: 'default',
      }));

      try {
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          this.logger.warn(`Expo push rejected the batch: HTTP ${response.status}`);
          continue;
        }

        const result = (await response.json()) as { data?: ExpoTicket[] };
        const tickets = result.data ?? [];
        const dead: string[] = [];

        tickets.forEach((ticket, index) => {
          if (ticket.status === 'ok') {
            delivered += 1;
            return;
          }
          const token = batch[index];
          if (ticket.details?.error === 'DeviceNotRegistered' && token) dead.push(token);
          else this.logger.warn(`Push failed: ${ticket.message ?? 'unknown error'}`);
        });

        if (dead.length > 0) {
          await this.prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
          this.logger.log(`Removed ${dead.length} unregistered push token(s)`);
        }
      } catch (error) {
        // Offline dev machines have no route to exp.host; that is not an error
        // worth failing a job over.
        this.logger.warn(`Could not reach Expo push: ${(error as Error).message}`);
      }
    }

    return delivered;
  }
}
