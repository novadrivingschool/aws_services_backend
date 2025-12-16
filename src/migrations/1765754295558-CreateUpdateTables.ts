import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUpdateTables1765754295558 implements MigrationInterface {
    name = 'CreateUpdateTables1765754295558'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "nova_s3" ALTER COLUMN "employeeNumber" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "nova_s3" ALTER COLUMN "employeeNumber" SET NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_nova_s3_root_emp_path" ON "nova_s3" ("root", "employeeNumber", "path") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."uq_nova_s3_root_emp_path"`);
        await queryRunner.query(`ALTER TABLE "nova_s3" ALTER COLUMN "employeeNumber" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "nova_s3" ALTER COLUMN "employeeNumber" DROP NOT NULL`);
    }

}
