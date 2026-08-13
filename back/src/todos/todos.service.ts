import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFileSync } from 'node:fs';
import { Todo } from './todo.entity';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

const APP_CONFIG_PATH = '/app/config/app.json';

interface AppConfig {
  maxTodos: number;
}

function readAppConfig(): AppConfig {
  let raw: string;
  try {
    raw = readFileSync(APP_CONFIG_PATH, 'utf8');
  } catch (e) {
    throw new InternalServerErrorException(
      `Cannot read runtime config at ${APP_CONFIG_PATH}: ${(e as Error).message}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new InternalServerErrorException(
      `Runtime config at ${APP_CONFIG_PATH} is not valid JSON: ${(e as Error).message}`,
    );
  }
  const max = (parsed as { maxTodos?: unknown })?.maxTodos;
  if (typeof max !== 'number' || !Number.isFinite(max) || max < 0) {
    throw new InternalServerErrorException(
      `Runtime config at ${APP_CONFIG_PATH} must contain numeric "maxTodos" >= 0`,
    );
  }
  return { maxTodos: max };
}

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo) private readonly repo: Repository<Todo>,
  ) {}

  findAll(): Promise<Todo[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Todo> {
    const todo = await this.repo.findOne({ where: { id } });
    if (!todo) throw new NotFoundException(`Todo ${id} not found`);
    return todo;
  }

  async create(dto: CreateTodoDto): Promise<Todo> {
    const { maxTodos } = readAppConfig();
    const count = await this.repo.count();
    if (count >= maxTodos) {
      throw new BadRequestException(
        `Todo limit reached (${count}/${maxTodos}). Increase "maxTodos" in app config.`,
      );
    }
    const todo = this.repo.create({
      title: dto.title,
      description: dto.description ?? null,
      completed: false,
    });
    return this.repo.save(todo);
  }

  async update(id: string, dto: UpdateTodoDto): Promise<Todo> {
    const todo = await this.findOne(id);
    if (dto.title !== undefined) todo.title = dto.title;
    if (dto.description !== undefined) todo.description = dto.description;
    if (dto.completed !== undefined) todo.completed = dto.completed;
    return this.repo.save(todo);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) throw new NotFoundException(`Todo ${id} not found`);
  }
}
