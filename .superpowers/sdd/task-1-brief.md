### Task 1: Backend — Restructure auth endpoints

**Files:**
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`

**Interfaces:**
- Consumes: existing `AuthService` methods (login, signup, candidateSignup, candidateLogin)
- Produces: `POST /auth/signin` (unified), `POST /auth/signup` (candidate), `POST /auth/org/signup` (tenant)

- [ ] **Step 1: Update auth.controller.ts — restructure endpoints**

```typescript
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { CandidateSignupDto } from './dto/candidate-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('org/signup')
  async orgSignup(
    @Body()
    dto: {
      companyName: string;
      slug: string;
      email: string;
      password: string;
    },
  ) {
    return this.authService.orgSignup(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signin(@Body() dto: { email: string; password: string }) {
    return this.authService.signin(dto);
  }

  @Post('signup')
  async signup(@Body() dto: CandidateSignupDto) {
    return this.authService.candidateSignup(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: { refreshToken: string }) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async logout(@Request() req: any) {
    await this.authService.logout(req.user.userId);
    return { message: 'Logged out' };
  }
}
```

- [ ] **Step 2: Update auth.service.ts — rename `signup` → `orgSignup`, add unified `signin`**

Change the `signup` method name to `orgSignup`:

```typescript
  async orgSignup(dto: {
    companyName: string;
    slug: string;
    email: string;
    password: string;
  }) {
    // ... same body as current signup()
  }
```

Add unified `signin` that replaces both `login` and `candidateLogin`:

```typescript
  async signin(dto: { email: string; password: string }) {
    // First: try org user login
    const { db: pubDb, release } = await this.drizzleSchema.forPublic();
    let emailRecord: { tenantId: string; userId: string } | null = null;
    try {
      const records = await pubDb
        .select()
        .from(userEmails)
        .where(eq(userEmails.email, dto.email))
        .execute();
      if (records.length > 0) {
        emailRecord = records[0];
      }
    } finally {
      release();
    }

    if (emailRecord) {
      // Org user login flow
      const { db: tenantDb, release: tenantRelease } =
        await this.drizzleSchema.forSchema(`tenant_${emailRecord.tenantId}`);
      try {
        const userResult = await tenantDb
          .select()
          .from(users)
          .where(eq(users.email, dto.email))
          .execute();
        if (userResult.length === 0)
          throw new UnauthorizedException('Invalid credentials');
        const user = userResult[0];
        const valid = await verifyPassword(user.passwordHash, dto.password);
        if (!valid) throw new UnauthorizedException('Invalid credentials');

        return this.generateTokens(user.id, emailRecord.tenantId, user.role);
      } finally {
        tenantRelease();
      }
    }

    // Fallback: try candidate login
    const account = await this.candidateAccountRepo.findByEmail(dto.email);
    if (!account) throw new UnauthorizedException('Invalid credentials');

    const valid = await verifyPassword(account.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.generateCandidateTokens(account.id);
  }
```

Remove the old `login()` and `candidateLogin()` methods entirely.

**Important:** The existing `signup` method and the DTO import for `CandidateLoginDto` should be removed. Keep `CandidateSignupDto`.

- [ ] **Step 3: Run typecheck and lint**

Run: `cd backend && npm run typecheck && npm run lint`
Expected: No type/lint errors from the refactored code.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/auth/auth.controller.ts backend/src/modules/auth/auth.service.ts
git commit -m "feat(auth): unify signin, rename signup -> org/signup"
```

---

