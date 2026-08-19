import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { STORAGE_PROVIDER } from '@/common/storage/storage.provider';

@Injectable()
export class StorageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly avatarBucket: string;

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly client: S3Client,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>('S3_BUCKET') ?? 'resumes';
    this.avatarBucket = config.get<string>('S3_AVATAR_BUCKET') ?? 'avatars';
  }

  async onApplicationBootstrap() {
    await Promise.all([
      this.ensureBucket(this.bucket),
      this.ensureBucket(this.avatarBucket),
    ]);
  }

  private async ensureBucket(bucket: string) {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      this.logger.log(`Created bucket "${bucket}"`);
    }
  }

  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
    bucket = this.bucket,
  ) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string, bucket = this.bucket): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async delete(key: string, bucket = this.bucket) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }
}
