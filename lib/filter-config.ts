export type FilterConfig =
  | {
      key:
        | "scoreType"
        | "universityName"
        | "programName"
        | "city"
        | "universityType"
        | "feeType"
        | "educationType";
      label: string;
      type: "select" | "text";
      placeholder: string;
    }
  | {
      key: "minRank" | "maxRank";
      label: string;
      type: "number";
      placeholder: string;
    };

export const filterConfig: FilterConfig[] = [
  { key: "scoreType", label: "Puan Türü", type: "select", placeholder: "Tümü" },
  { key: "universityName", label: "Üniversite", type: "select", placeholder: "Tümü" },
  { key: "programName", label: "Program", type: "select", placeholder: "Tümü" },
  { key: "city", label: "Şehir", type: "select", placeholder: "Tümü" },
  { key: "universityType", label: "Üniversite Türü", type: "select", placeholder: "Tümü" },
  { key: "feeType", label: "Ücret / Burs", type: "select", placeholder: "Tümü" },
  { key: "educationType", label: "Öğretim Türü", type: "select", placeholder: "Tümü" },
  { key: "minRank", label: "En Az Başarı Sırası", type: "number", placeholder: "En az başarı sırası" },
  { key: "maxRank", label: "En Çok Başarı Sırası", type: "number", placeholder: "En çok başarı sırası" },
];
