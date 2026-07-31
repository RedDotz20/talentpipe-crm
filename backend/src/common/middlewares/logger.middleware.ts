import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const userAgent = req.get('user-agent') || '';

    this.logger.log(`Req: ${method} ${originalUrl} - ${userAgent}`);

    res.on('finish', () => {
      const { statusCode } = res;
      this.logger.log(`Res: ${method} ${originalUrl} ${statusCode}`);
    });

    next();
  }
}
