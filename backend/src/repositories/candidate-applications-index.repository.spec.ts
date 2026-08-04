import { DrizzleDB, DrizzleSchemaService } from '../database/drizzle-schema.service';
import { CandidateApplicationsIndexRepository } from './candidate-applications-index.repository';

describe('CandidateApplicationsIndexRepository', () => {
  const forPublic = jest.fn();
  const drizzleSchema = {
    forPublic,
  } as unknown as DrizzleSchemaService;
  let repository: CandidateApplicationsIndexRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new CandidateApplicationsIndexRepository(drizzleSchema);
  });

  it('finds an application only when it belongs to the candidate', async () => {
    const expected = {
      applicationId: 'app-a',
      candidateAccountId: 'candidate-a',
    };
    const execute = jest.fn().mockResolvedValue([expected]);
    const limit = jest.fn().mockReturnValue({ execute });
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    const db = { select: jest.fn().mockReturnValue({ from }) } as unknown as DrizzleDB;
    forPublic.mockResolvedValue({
      db,
      release: jest.fn(),
    });

    await expect(
      repository.findByCandidateAndApplication('candidate-a', 'app-a'),
    ).resolves.toEqual(expected);
    expect(forPublic).toHaveBeenCalled();
    expect(execute).toHaveBeenCalled();
  });

  it('updates status only within the indexed tenant boundary', async () => {
    const expected = {
      applicationId: 'app-a',
      tenantId: 'tenant-a',
      status: 'Screening',
    };
    const execute = jest.fn().mockResolvedValue([expected]);
    const returning = jest.fn().mockReturnValue({ execute });
    const where = jest.fn().mockReturnValue({ returning });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const db = { update } as unknown as DrizzleDB;
    forPublic.mockResolvedValue({
      db,
      release: jest.fn(),
    });

    await expect(
      repository.updateStatus('app-a', 'tenant-a', 'Screening'),
    ).resolves.toEqual(expected);
    expect(set).toHaveBeenCalledWith({ status: 'Screening' });
    expect(execute).toHaveBeenCalled();
  });
});
