import { Injectable } from '@nestjs/common';
import { CacheService } from '../../common/cache/cache.service';
import { dashboardSummaryKey } from '../../common/cache/cache.constants';
import { getTenantId } from '../../common/context/tenant-context';
import {
  DashboardRepository,
  DashboardSummary,
} from '../../repositories/dashboard.repository';

const SUMMARY_TTL_SECONDS = 60;

@Injectable()
export class DashboardService {
  constructor(
    private readonly cache: CacheService,
    private readonly dashboardRepo: DashboardRepository,
  ) {}

  async getSummary(): Promise<DashboardSummary> {
    const tenantId = getTenantId();
    const key = dashboardSummaryKey(tenantId);

    let cached: DashboardSummary | null = null;
    try {
      cached = await this.cache.get<DashboardSummary>(key);
    } catch {
      // A cache outage must not prevent the tenant dashboard from loading.
    }
    if (cached) return cached;

    const summary = await this.dashboardRepo.findSummary();
    try {
      await this.cache.set(key, summary, SUMMARY_TTL_SECONDS);
    } catch {
      // Cache writes are best-effort; the aggregate remains the response.
    }
    return summary;
  }
}
