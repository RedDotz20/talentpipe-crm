import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { SkipEnvelope } from '@/common/decorators/skip-envelope.decorator';
import { AvatarsService } from '@/modules/avatars/avatars.service';

@Controller('avatars')
export class AvatarsController {
  constructor(private readonly avatarsService: AvatarsService) {}

  @Get('file')
  @UseGuards(AuthGuard('jwt'))
  @SkipEnvelope()
  async file(@Query('key') key: string | undefined, @Res() res: Response) {
    if (!key || !this.avatarsService.isAvatarKey(key)) {
      throw new BadRequestException('Invalid avatar key');
    }
    const buffer = await this.avatarsService.get(key);
    if (!buffer) throw new NotFoundException('Avatar not found');
    res.setHeader('Content-Type', this.avatarsService.contentTypeOf(key));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  }
}
