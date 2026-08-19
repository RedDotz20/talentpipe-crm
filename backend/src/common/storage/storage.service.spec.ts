import { StorageService } from '@/common/storage/storage.service';

describe('StorageService', () => {
  const sent: Array<{ cmd: string; input: Record<string, unknown> }> = [];
  const client = {
    send: jest.fn(
      (cmd: {
        constructor: { name: string };
        input: Record<string, unknown>;
      }) => {
        if (cmd.constructor.name === 'HeadBucketCommand')
          throw new Error('NoSuchBucket');
        sent.push({ cmd: cmd.constructor.name, input: cmd.input });
        return {};
      },
    ),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'S3_BUCKET' ? 'resumes' : undefined,
    ),
  };
  let service: StorageService;

  beforeEach(() => {
    sent.length = 0;
    jest.clearAllMocks();
    service = new StorageService(client as never, config as never);
  });

  it('creates both buckets on bootstrap', async () => {
    await service.onApplicationBootstrap();
    const creates = sent.filter((s) => s.cmd === 'CreateBucketCommand');
    expect(creates.map((c) => c.input.Bucket).sort()).toEqual([
      'avatars',
      'resumes',
    ]);
  });

  it('routes uploads to the default resume bucket', async () => {
    await service.upload('k', Buffer.from('x'), 'application/pdf');
    const put = sent.find((s) => s.cmd === 'PutObjectCommand');
    expect(put?.input).toMatchObject({ Bucket: 'resumes', Key: 'k' });
  });

  it('routes uploads to the avatar bucket when passed', async () => {
    await service.upload('k', Buffer.from('x'), 'image/png', 'avatars');
    const put = sent.find((s) => s.cmd === 'PutObjectCommand');
    expect(put?.input).toMatchObject({ Bucket: 'avatars', Key: 'k' });
  });

  it('routes get/delete to the avatar bucket when passed', async () => {
    await service.get('k', 'avatars');
    await service.delete('k', 'avatars');
    expect(sent.find((s) => s.cmd === 'GetObjectCommand')?.input).toMatchObject(
      { Bucket: 'avatars', Key: 'k' },
    );
    expect(
      sent.find((s) => s.cmd === 'DeleteObjectCommand')?.input,
    ).toMatchObject({ Bucket: 'avatars', Key: 'k' });
  });
});
