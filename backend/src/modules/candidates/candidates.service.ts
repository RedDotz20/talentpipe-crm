import { Injectable, NotFoundException } from '@nestjs/common';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { CreateCandidateDto } from './dto/create-candidate.dto';

@Injectable()
export class CandidatesService {
  constructor(private readonly candidateRepo: CandidateRepository) {}

  list() {
    return this.candidateRepo.findAll();
  }

  async getOne(id: string) {
    const candidate = await this.candidateRepo.findById(id);
    if (!candidate) throw new NotFoundException('Candidate not found');
    return candidate;
  }

  create(dto: CreateCandidateDto) {
    return this.candidateRepo.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
    });
  }
}
