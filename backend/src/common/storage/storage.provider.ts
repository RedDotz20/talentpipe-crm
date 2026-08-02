import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

function normalizeEndpoint(raw: string | undefined): string {
  const endpoint = raw ?? 'http://localhost:9000';
  return /^https?:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`;
}

export const storageProvider = {
  provide: STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new S3Client({
      region: config.get<string>('MINIO_REGION') ?? 'us-east-1',
      endpoint: normalizeEndpoint(config.get<string>('MINIO_ENDPOINT')),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get<string>('MINIO_ACCESS_KEY') ?? 'minioadmin',
        secretAccessKey: config.get<string>('MINIO_SECRET_KEY') ?? 'minioadmin',
      },
    });
  },
};
