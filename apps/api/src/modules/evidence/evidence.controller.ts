import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { EvidenceContext } from '@prisma/client';
import {
  attachEvidenceSchema,
  completeEvidenceSchema,
  idSchema,
  presignEvidenceSchema,
  type AttachEvidenceInput,
  type CompleteEvidenceInput,
  type PresignEvidenceInput,
} from '@ahlan/shared';

import { ApiZodBody, CurrentUser, StadiumScope } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StadiumScopeGuard } from '../../common/guards/stadium-scope.guard';
import { zodBody, zodParam } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { EvidenceService } from './evidence.service';

@ApiTags('evidence')
@ApiBearerAuth()
@Controller('evidence')
@UseGuards(RolesGuard, StadiumScopeGuard)
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Post('presign')
  @StadiumScope({ source: 'body', field: 'stadiumId', optional: false })
  @ApiOperation({
    summary: 'Get a presigned PUT for a photo',
    description:
      'Send the device-generated evidence id. Re-sending the same id returns the same object key, so a retry is safe. ' +
      'If that id is already UPLOADED the API answers 409 ALREADY_EXISTS with `details.objectKey`; the app treats that as success. ' +
      '`sizeBytes` is signed into the URL as Content-Length, so it must be the exact byte length of the PUT body.',
  })
  @ApiZodBody(presignEvidenceSchema)
  presign(
    @Body(zodBody(presignEvidenceSchema)) body: PresignEvidenceInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.evidence.presign(body, actor);
  }

  @Post(':id/complete')
  @ApiOperation({
    summary: 'Confirm an upload finished',
    description:
      'The API checks the object really exists before marking it uploaded. Idempotent: calling it again on uploaded evidence returns the same record.',
  })
  @ApiZodBody(completeEvidenceSchema)
  complete(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(completeEvidenceSchema)) body: CompleteEvidenceInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.evidence.complete(id, body, actor);
  }

  @Post('attach')
  @ApiOperation({ summary: 'Link uploaded evidence to a parent record' })
  @ApiZodBody(attachEvidenceSchema)
  async attach(
    @Body(zodBody(attachEvidenceSchema)) body: AttachEvidenceInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.evidence.attach(body.evidenceIds, body.context, body.contextId, actor);
    return { attached: body.evidenceIds.length };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Evidence metadata with a short-lived download URL' })
  get(@Param('id', zodParam(idSchema)) id: string, @CurrentUser() actor: RequestUser) {
    return this.evidence.get(id, actor);
  }

  @Get('by-context/:context/:contextId')
  @ApiOperation({ summary: 'All evidence attached to one record' })
  listFor(
    @Param('context') context: EvidenceContext,
    @Param('contextId', zodParam(idSchema)) contextId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.evidence.listFor(context, contextId, actor);
  }
}
