import { Q } from '@nozbe/watermelondb';

import { collections } from '../../db';
import { deleteLocalFile, listLocalEvidenceFiles } from './local-files';

/**
 * Frees the device copies of photos the server has confirmed.
 *
 * Runs at the start of a sync pass, so a photo uploaded in the previous pass
 * kept showing its local file until now (no thumbnail blink) and from here on
 * renders from a presigned GET.
 *
 * Also sweeps files whose row the server has since marked UPLOADED through a
 * pull (which overwrites `local_uri`). A file with no row at all is left alone:
 * it may belong to a capture that is still being written.
 */
export async function purgeUploadedLocalCopies(): Promise<number> {
  let purged = 0;

  const uploaded = await collections
    .evidence()
    .query(Q.where('upload_status', 'UPLOADED'), Q.where('local_uri', Q.notEq(null)))
    .fetch();
  for (const evidence of uploaded) {
    if (evidence.localUri) deleteLocalFile(evidence.localUri);
    await evidence.clearLocalCopy();
    purged += 1;
  }

  const files = listLocalEvidenceFiles();
  if (files.length > 0) {
    const ids = files.map((file) => file.id);
    const done = await collections
      .evidence()
      .query(Q.where('id', Q.oneOf(ids)), Q.where('upload_status', 'UPLOADED'))
      .fetch();
    const doneIds = new Set(done.map((row) => row.id));
    for (const file of files) {
      if (doneIds.has(file.id)) {
        deleteLocalFile(file.uri);
        purged += 1;
      }
    }
  }

  return purged;
}
