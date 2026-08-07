import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE = 'skipEnvelope';
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE, true);
