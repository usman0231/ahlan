import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  checkTransition,
  uuidv7,
  type AssignCorrectiveActionInput,
  type Finding as FindingDto,
  type TransitionCorrectiveActionInput,
  type UpdateCorrectiveActionInput,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { buildDiff, hasChanges } from '../../common/util/diff';
import { toDateColumn } from '../../common/util/local-date';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { EvidenceService } from '../evidence/evidence.service';
import { FindingsService } from '../findings/findings.service';

/**
 * The corrective-action lifecycle.
 *
 * Every status move goes through `checkTransition` from `@ahlan/shared`, which
 * is the same function the app uses to decide which buttons to render. That is
 * why the API and the UI can never disagree about what is allowed - including
 * the two rules that matter most: only an admin can close, and closing needs
 * closure evidence. Supervisors may assign, edit, re-open and send back - for
 * their own stadiums only.
 */
@Injectable()
export class CorrectiveActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
    private readonly findings: FindingsService,
  ) {}

  /** Assigns the first action and moves the finding OPEN -> ACTION_ASSIGNED. */
  async assign(
    findingId: string,
    input: AssignCorrectiveActionInput,
    actor: RequestUser,
  ): Promise<FindingDto> {
    const finding = await this.prisma.finding.findUnique({
      where: { id: findingId },
      include: { actions: true },
    });
    if (!finding) throw AppException.notFound('Finding', findingId);
    this.findings.assertInScope(finding.stadiumId, actor);

    const transition = checkTransition({
      from: finding.status,
      to: 'ACTION_ASSIGNED',
      role: actor.role,
    });
    if (!transition.allowed) {
      throw new AppException(transition.code, transition.message, 409);
    }

    if (input.assigneeId) {
      await this.assertAssignable(input.assigneeId, finding.stadiumId);
    }

    const actionId = input.id ?? uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.correctiveAction.create({
        data: {
          id: actionId,
          findingId,
          assigneeId: input.assigneeId ?? null,
          responsibleParty: input.responsibleParty ?? null,
          action: input.action,
          dueDate: toDateColumn(input.dueDate),
          status: 'ACTION_ASSIGNED',
        },
      });
      await this.findings.syncStatusFromAction(tx, findingId, 'ACTION_ASSIGNED');
      await this.audit.record(
        {
          actor,
          action: 'STATUS_CHANGE',
          entity: 'corrective_actions',
          entityId: actionId,
          stadiumId: finding.stadiumId,
          diff: {
            status: { from: finding.status, to: 'ACTION_ASSIGNED' },
            assigneeId: { from: null, to: input.assigneeId ?? null },
            dueDate: { from: null, to: input.dueDate },
          },
        },
        tx,
      );
    });

    if (input.assigneeId) {
      await this.findings.notifyAssignment(findingId, input.assigneeId);
    }

    return this.findings.get(findingId, actor);
  }

  async update(
    actionId: string,
    input: UpdateCorrectiveActionInput,
    actor: RequestUser,
  ): Promise<FindingDto> {
    const action = await this.prisma.correctiveAction.findUnique({
      where: { id: actionId },
      include: { finding: { select: { stadiumId: true, status: true } } },
    });
    if (!action) throw AppException.notFound('Corrective action', actionId);
    this.findings.assertInScope(action.finding.stadiumId, actor);
    if (action.status === 'CLOSED') {
      throw AppException.locked('This action is closed and can no longer be edited');
    }
    if (input.assigneeId) {
      await this.assertAssignable(input.assigneeId, action.finding.stadiumId);
    }

    const patch = {
      assigneeId: input.assigneeId ?? undefined,
      responsibleParty: input.responsibleParty ?? undefined,
      action: input.action,
      dueDate: input.dueDate ? toDateColumn(input.dueDate) : undefined,
    };
    const diff = buildDiff(action, patch as never);

    await this.prisma.$transaction(async (tx) => {
      await tx.correctiveAction.update({ where: { id: actionId }, data: patch });
      if (hasChanges(diff)) {
        await this.audit.record(
          {
            actor,
            action: 'UPDATE',
            entity: 'corrective_actions',
            entityId: actionId,
            stadiumId: action.finding.stadiumId,
            reason: input.reason ?? null,
            diff,
          },
          tx,
        );
      }
    });

    const reassigned = input.assigneeId && input.assigneeId !== action.assigneeId;
    if (reassigned && input.assigneeId) {
      await this.findings.notifyAssignment(action.findingId, input.assigneeId);
    }

    return this.findings.get(action.findingId, actor);
  }

  /** The single entry point for every status move. */
  async transition(
    actionId: string,
    input: TransitionCorrectiveActionInput,
    actor: RequestUser,
  ): Promise<FindingDto> {
    const action = await this.prisma.correctiveAction.findUnique({
      where: { id: actionId },
      include: { finding: { select: { id: true, stadiumId: true, reference: true } } },
    });
    if (!action) throw AppException.notFound('Corrective action', actionId);
    this.findings.assertInScope(action.finding.stadiumId, actor);

    // Photos sent with the request count towards the closure-evidence rule, so
    // they are attached before the transition is evaluated.
    const closureContext =
      input.to === 'CLOSED' ? 'CORRECTIVE_ACTION_CLOSURE' : 'CORRECTIVE_ACTION_PROGRESS';
    if (input.evidenceIds.length > 0) {
      await this.evidence.attach(input.evidenceIds, closureContext, actionId, actor);
    }

    const closureEvidenceCount = await this.evidence.countFor(
      'CORRECTIVE_ACTION_CLOSURE',
      actionId,
    );

    const result = checkTransition({
      from: action.status,
      to: input.to,
      role: actor.role,
      isAssignee: action.assigneeId === actor.id,
      closureEvidenceCount,
      note: input.note ?? null,
    });
    if (!result.allowed) {
      throw new AppException(result.code, result.message, 409);
    }

    const now = new Date();
    const timestamps: Prisma.CorrectiveActionUpdateInput = {};
    switch (input.to) {
      case 'IN_PROGRESS':
        timestamps.startedAt = action.startedAt ?? now;
        // Sent back from verification: clear the earlier completion.
        timestamps.completedAt = null;
        break;
      case 'PENDING_VERIFICATION':
        timestamps.completedAt = now;
        break;
      case 'CLOSED':
        timestamps.verifiedAt = now;
        timestamps.verifiedBy = { connect: { id: actor.id } };
        timestamps.closureNote = input.note ?? null;
        break;
      default:
        break;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.correctiveAction.update({
        where: { id: actionId },
        data: { status: input.to, ...timestamps },
      });
      await this.findings.syncStatusFromAction(tx, action.findingId, input.to);
      await this.audit.record(
        {
          actor,
          action: 'STATUS_CHANGE',
          entity: 'corrective_actions',
          entityId: actionId,
          stadiumId: action.finding.stadiumId,
          reason: input.note ?? null,
          diff: { status: { from: action.status, to: input.to } },
        },
        tx,
      );
    });

    return this.findings.get(action.findingId, actor);
  }

  /**
   * An action can only go to somebody who actually covers that stadium, and
   * never to a supervisor: supervisors review the work, they do not carry it out.
   */
  private async assertAssignable(assigneeId: string, stadiumId: string): Promise<void> {
    const assignee = await this.prisma.user.findFirst({
      where: { id: assigneeId, deletedAt: null, status: 'ACTIVE' },
      select: { role: true, stadiums: { select: { stadiumId: true } } },
    });
    if (!assignee) throw AppException.notFound('Assignee', assigneeId);
    if (assignee.role === 'SUPERVISOR') {
      throw AppException.validation('A corrective action cannot be assigned to a supervisor');
    }
    if (
      assignee.role !== 'ADMIN' &&
      !assignee.stadiums.some((row) => row.stadiumId === stadiumId)
    ) {
      throw AppException.validation('The assignee is not assigned to this stadium');
    }
  }
}
