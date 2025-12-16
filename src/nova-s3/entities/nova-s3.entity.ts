/* src/nova-s3/entities/nova-s3.entity.ts */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type NovaS3ItemType =
  | 'folder'
  | 'file'
  | 'folder_upload'
  | 'multi_file_upload';

@Entity({ name: 'nova_s3' })
@Index('uq_nova_s3_root_emp_path', ['root', 'employeeNumber', 'path'], { unique: true })
export class NovaS3 {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 120, default: 'nova-s3' })
  root: string;

  @Index()
  @Column({ type: 'varchar', length: 1024, default: '' })
  path: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 32 })
  type: NovaS3ItemType;

  @Index()
  @Column({ type: 'varchar', length: 1024, default: '' })
  parentPath: string;

  @Index()
  @Column({ type: 'varchar', length: 2048, nullable: true })
  s3Key: string | null;

  @Column({ type: 'bigint', nullable: true })
  size: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  mimeType: string | null;

  // 🔴 REQUIRED (todo es por employeeNumber)
  @Index()
  @Column({ type: 'varchar', length: 50, nullable: false })
  employeeNumber: string;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
