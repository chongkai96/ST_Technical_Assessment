export type CsvRow = {
  postId: string;
  id: string;
  name: string;
  email: string;
  body: string;
};

export type FieldChange = {
  field: keyof CsvRow;
  previous: string;
  incoming: string;
};

export type ConflictItem = {
  recordId: string;
  previous: CsvRow;
  incoming: CsvRow;
  changes: FieldChange[];
};

export type DbRecord = CsvRow & {
  dbId: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};
