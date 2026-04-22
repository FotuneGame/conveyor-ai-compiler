import { Injectable } from "@nestjs/common";
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';



@Injectable()
export class HashService {
    constructor(
        private configService: ConfigService
    ) {}

    async generate(data: string) {
        const rounds = this.configService.get<number>('hash.rounds', 12);
        const salt = await bcrypt.genSalt(rounds);
        const hash = await bcrypt.hash(data, salt); 
        return hash;
    }

    async compare(data: string, hash: string) {
        return await bcrypt.compare(data, hash);
    }
}