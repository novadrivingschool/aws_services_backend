import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUpdateTables1768189949557 implements MigrationInterface {
    name = 'CreateUpdateTables1768189949557'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "nova_s3" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "root" character varying(120) NOT NULL DEFAULT 'nova-s3', "path" character varying(1024) NOT NULL DEFAULT '', "name" character varying(255) NOT NULL, "type" character varying(32) NOT NULL, "parentPath" character varying(1024) NOT NULL DEFAULT '', "s3Key" character varying(2048), "size" bigint, "mimeType" character varying(255), "employeeNumber" character varying(50) NOT NULL, "meta" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f0f7ca5a0d75e91c2e41fc24c34" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cbb4675ff61075dd8eeac848a3" ON "nova_s3" ("root") `);
        await queryRunner.query(`CREATE INDEX "IDX_a4860b8ebc4cc673bdffa9b30c" ON "nova_s3" ("path") `);
        await queryRunner.query(`CREATE INDEX "IDX_ddd69caf8e8b55f886b7e6f790" ON "nova_s3" ("parentPath") `);
        await queryRunner.query(`CREATE INDEX "IDX_e7c2b6af1b7f27127584fb03fd" ON "nova_s3" ("s3Key") `);
        await queryRunner.query(`CREATE INDEX "IDX_b6f5f09e34aa8e6cd5c5422d53" ON "nova_s3" ("employeeNumber") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_nova_s3_root_emp_path" ON "nova_s3" ("root", "employeeNumber", "path") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."uq_nova_s3_root_emp_path"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b6f5f09e34aa8e6cd5c5422d53"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e7c2b6af1b7f27127584fb03fd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ddd69caf8e8b55f886b7e6f790"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a4860b8ebc4cc673bdffa9b30c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cbb4675ff61075dd8eeac848a3"`);
        await queryRunner.query(`DROP TABLE "nova_s3"`);
    }

}
