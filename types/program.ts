export type ProgramYearDto = {
  year: number;
  quota: number | null;
  placed: number | null;
  lowestScore: number | null;
  highestScore: number | null;
  successRank: number | null;
};

export type ProgramSpecialConditionDto = {
  code: string;
  description: string;
};

export type ProgramDto = {
  code: string;
  universityName: string;
  originalUniversityName: string;
  facultyName: string;
  programName: string;
  scoreType: string;
  universityType: string;
  city: string | null;
  feeType: string;
  educationType: string;
  latest: ProgramYearDto | null;
  years: ProgramYearDto[];
  specialConditions?: ProgramSpecialConditionDto[];
  minSuccessRankCondition?: number | null;
  accreditation?: string | null;
  academicStaffUrl?: string | null;
};

export type ProgramFilters = {
  scoreType?: string[];
  universityName?: string[];
  programName?: string[];
  city?: string[];
  universityType?: string[];
  feeType?: string[];
  educationType?: string[];
  minRank?: string;
  maxRank?: string;
};
