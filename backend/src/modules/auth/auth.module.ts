import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { DrizzleSchemaService } from '../../database/drizzle-schema.service';
import { drizzleProvider } from '../../database/drizzle.provider';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    DrizzleSchemaService,
    drizzleProvider,
    TenantRepository,
    UserRepository,
    CandidateAccountRepository,
  ],
  exports: [JwtStrategy, PassportModule],
})
export class AuthModule {}
