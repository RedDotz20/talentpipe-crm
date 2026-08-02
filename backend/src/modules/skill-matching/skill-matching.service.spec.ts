import { SkillMatchingService } from './skill-matching.service';

describe('SkillMatchingService', () => {
  let service: SkillMatchingService;

  beforeEach(() => {
    service = new SkillMatchingService();
  });

  it('returns 0 when there are no required skills', () => {
    expect(service.computeScore([], ['s1'])).toBe(0);
  });

  it('returns 1 for a full match', () => {
    expect(service.computeScore(['s1', 's2'], ['s1', 's2', 's3'])).toBe(1);
  });

  it('returns partial score for a partial match', () => {
    expect(service.computeScore(['s1', 's2', 's3'], ['s1'])).toBeCloseTo(1 / 3);
  });

  it('returns 0 when nothing matches', () => {
    expect(service.computeScore(['s1', 's2'], ['s3', 's4'])).toBe(0);
  });
});
