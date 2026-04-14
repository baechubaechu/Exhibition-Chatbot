/** canonical 파일 목록 + 역할(소화·프롬프트용) */
export const CANONICAL_ROLE: Record<string, string> = {
  "00_project_overview.md": "프로젝트 개요·범위·용어를 한 페이지에 정리.",
  "01_why_geumjeong.md": "왜 금정인지: 입지·맥락·전제.",
  "02_extra_space.md": "여유 공간 개념과 도시/건축적 의미.",
  "03_site_analysis.md": "대지 분석: 주변 환경, 동선, 제약, 기회.",
  "04_layers.md": "층위·수직 프로그램·연결.",
  "05_nodes.md": "노드 정의와 관계.",
  "06_massing.md": "매싱·밀도·조망·볼륨 전략.",
  "07_theory.md": "이론·레퍼런스·키워드.",
  "08_public_faq.md": "일반 방문자 FAQ.",
  "09_critic_faq.md": "비평·심사 대응 FAQ.",
};

export const CANONICAL_FILES = Object.keys(CANONICAL_ROLE);
