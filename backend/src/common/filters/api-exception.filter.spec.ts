import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

function makeHost(): ArgumentsHost {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const getResponse = jest.fn().mockReturnValue({ status });
  const getRequest = jest.fn().mockReturnValue({});
  return {
    switchToHttp: () => ({ getResponse, getRequest, getNext: jest.fn() }),
  } as unknown as ArgumentsHost;
}

function capture(host: ArgumentsHost) {
  const http = host.switchToHttp() as unknown as {
    getResponse: () => { status: jest.Mock };
  };
  const response = http.getResponse();
  const statusMock = response.status() as { json: jest.Mock };
  const json = statusMock.json;
  const status = response.status;
  return { status, json };
}

describe('ApiExceptionFilter', () => {
  let filter: ApiExceptionFilter;

  beforeEach(() => {
    filter = new ApiExceptionFilter();
  });

  it('maps UnauthorizedException to UNAUTHORIZED code', () => {
    const host = makeHost();
    const { status, json } = capture(host);
    filter.catch(
      new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED),
      host,
    );
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
    });
  });

  it('maps ConflictException to CONFLICT code', () => {
    const host = makeHost();
    const { status, json } = capture(host);
    filter.catch(
      new HttpException('Slug already taken', HttpStatus.CONFLICT),
      host,
    );
    expect(json).toHaveBeenCalledWith({
      error: { code: 'CONFLICT', message: 'Slug already taken' },
    });
    expect(status).toHaveBeenCalledWith(409);
  });

  it('joins ValidationPipe string[] messages with ", "', () => {
    const host = makeHost();
    const { json } = capture(host);
    filter.catch(
      new HttpException(
        {
          message: ['email must be valid', 'password too short'],
          error: 'Bad Request',
          statusCode: 400,
        },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'email must be valid, password too short',
      },
    });
  });

  it('maps plain Error to 500 INTERNAL_ERROR with its message', () => {
    const host = makeHost();
    const { status, json } = capture(host);
    filter.catch(new Error('db exploded'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'db exploded' },
    });
  });

  it('falls back to INTERNAL_ERROR + "Internal server error" for unknown throws', () => {
    const host = makeHost();
    const { status, json } = capture(host);
    filter.catch('weird', host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});
