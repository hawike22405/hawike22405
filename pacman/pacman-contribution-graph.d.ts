declare module "pacman-contribution-graph" {
  export type ContributionLevel =
    | "NONE"
    | "FIRST_QUARTILE"
    | "SECOND_QUARTILE"
    | "THIRD_QUARTILE"
    | "FOURTH_QUARTILE";

  export interface PacmanContributionCell {
    commitsCount: number;
    color: string;
    level: ContributionLevel;
  }

  export interface PacmanRendererConfig {
    username: string;
    platform?: "github" | "gitlab";
    outputFormat?: "svg" | "canvas";
    gameTheme?: "github" | "github-dark" | "gitlab" | "gitlab-dark";
    gameSpeed?: number;
    svgCallback?: (svg: string) => void;
    enableSounds?: boolean;
    githubSettings?: {
      accessToken?: string;
    };
  }

  export interface PacmanRendererStore {
    grid: PacmanContributionCell[][];
    monthLabels: string[];
    contributions: unknown[];
  }

  export class PacmanRenderer {
    constructor(conf: PacmanRendererConfig);
    start(): Promise<PacmanRendererStore>;
    stop(): void;
  }
}
