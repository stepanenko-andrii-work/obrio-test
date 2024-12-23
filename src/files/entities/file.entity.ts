import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('files')
export class File {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  url: string;

  @Column({ nullable: false })
  name: string;
}
