export type TimeUnit = 'day' | 'week' | 'month';

export interface TimeSeriesPoint {
  label: string;
  count: number;
}

export type TimeSeries = Record<TimeUnit, TimeSeriesPoint[]>;
