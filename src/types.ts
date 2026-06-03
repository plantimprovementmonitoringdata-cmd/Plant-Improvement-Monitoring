export interface HazardReport {
  id: string;
  tanggal: string; // Format: YYYY-MM-DD
  judul: string;
  namaKaryawan: string;
  nrp: string;
  authorId?: string;
  createdAt?: any;
}

export interface SafetyTalk {
  id: string;
  tanggal: string; // Format: YYYY-MM-DD
  namaKaryawan: string;
  nrp: string;
  authorId?: string;
  createdAt?: any;
}

export interface TestFatigue {
  id: string;
  tanggal: string; // Format: YYYY-MM-DD
  namaKaryawan: string;
  nrp: string;
  authorId?: string;
  createdAt?: any;
}

export interface TargetStats {
  label: string;
  count: number;
  target: number;
  percentage: number;
  isReached: boolean;
  color: string;
}
