import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';
import { RefreshTokenRepository } from '../../../repositories/refresh-token.repository';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed-value'),
  verify: jest.fn().mockResolvedValue(true),
}));

describe('TokenService', () => {
  let service: TokenService;
  const jwtService = {
    sign: jest.fn().mockReturnValue('token'),
    verify: jest.fn(),
  };
  const configService = { get: jest.fn().mockReturnValue('refresh-secret') };
  const refreshTokenRepo = {
    deleteByUser: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue({ id: '1' }),
    findLatestByUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: RefreshTokenRepository, useValue: refreshTokenRepo },
      ],
    }).compile();
    service = module.get<TokenService>(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('issueTokens', () => {
    it('signs access + refresh, stores a hashed row, and returns both tokens', async () => {
      const result = await service.issueTokens({
        id: 'u1',
        tenantId: 't1',
        role: 'OrgAdmin',
      });

      expect(result).toEqual({ accessToken: 'token', refreshToken: 'token' });
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(jwtService.sign).toHaveBeenLastCalledWith(
        { sub: 'u1', tenantId: 't1', role: 'OrgAdmin' },
        expect.objectContaining({ secret: 'refresh-secret' }),
      );
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
      expect(refreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          tenantId: 't1',
          tokenHash: 'hashed-value',
          expiresAt: expect.any(Date) as Date,
        }),
      );
    });

    it('maps a null tenantId to the nil uuid in the stored row', async () => {
      await service.issueTokens({
        id: 'u1',
        tenantId: null,
        role: 'Candidate',
      });
      expect(refreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: '00000000-0000-0000-0000-000000000000',
        }),
      );
    });
  });

  describe('rotate', () => {
    it('throws UnauthorizedException when no stored record exists', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        tenantId: null,
        role: 'Candidate',
      });
      refreshTokenRepo.findLatestByUser.mockResolvedValue(null);
      await expect(service.rotate('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException on an expired stored record', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        tenantId: 't1',
        role: 'OrgAdmin',
      });
      refreshTokenRepo.findLatestByUser.mockResolvedValue({
        expiresAt: new Date(Date.now() - 1000),
        tokenHash: 'hashed-value',
      });
      await expect(service.rotate('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
    });

    it('re-issues tokens for a valid stored record', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        tenantId: 't1',
        role: 'OrgAdmin',
      });
      refreshTokenRepo.findLatestByUser.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: 'hashed-value',
      });
      const result = await service.rotate('refresh-token');
      expect(result).toEqual({ accessToken: 'token', refreshToken: 'token' });
    });
  });

  describe('logout', () => {
    it('deletes stored tokens for the user', async () => {
      await service.logout('u1');
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
    });
  });
});
