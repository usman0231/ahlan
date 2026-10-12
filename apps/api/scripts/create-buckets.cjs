// Creates the evidence and reports buckets in local S3 storage (SeaweedFS/MinIO).
// docker compose does this itself (service "minio-init"); run this when storage
// was installed by hand:  pnpm --filter api storage:init
// Reads apps/api/.env; existing buckets are left alone.
const fs = require('node:fs');
const path = require('node:path');
const { S3Client, CreateBucketCommand, ListBucketsCommand } = require('@aws-sdk/client-s3');

const envFile = path.join(__dirname, '..', '.env');
const env = { ...process.env };
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && env[match[1]] === undefined) env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
}

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT || 'http://localhost:9000',
  region: env.S3_REGION || 'us-east-1',
  forcePathStyle: (env.S3_FORCE_PATH_STYLE || 'true') === 'true',
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID || 'ahlan',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY || 'ahlan-secret',
  },
});

(async () => {
  for (const bucket of [env.S3_BUCKET_EVIDENCE || 'ahlan-evidence', env.S3_BUCKET_REPORTS || 'ahlan-reports']) {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`created  ${bucket}`);
    } catch (error) {
      if (/BucketAlready(Exists|OwnedByYou)/.test(error.name)) console.log(`exists   ${bucket}`);
      else throw error;
    }
  }
  const { Buckets = [] } = await s3.send(new ListBucketsCommand({}));
  console.log('buckets:', Buckets.map((b) => b.Name).join(', '));
})().catch((error) => {
  console.error(`Storage not reachable at ${env.S3_ENDPOINT || 'http://localhost:9000'}: ${error.message}`);
  process.exit(1);
});
