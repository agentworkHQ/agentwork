// === Task Spec ===

export type PaymentModel = "first_valid" | "best_by_deadline" | "per_unit";
export type SourceType = "git" | "archive";
export type TaskStatus = "open" | "filled" | "expired" | "cancelled";

export interface TaskSpec {
  version: string;
  id: string;
  publisher: string;
  created: string;
  expires: string;
  status: TaskStatus;
  tags: string[];

  source: {
    type: SourceType;
    url: string;
    ref: string;
  };

  description: string;

  verify: {
    command: string;
    output: string;
  };

  protected: string[];

  payment: {
    model: PaymentModel;
    amount: number;
    currency: string;
    max_payouts: number;
    verification_window: string;
  };
}

/** What publishers send when creating a task (server assigns id, created, status) */
export type TaskPublishInput = Omit<TaskSpec, "id" | "created" | "status">;

/** Lightweight projection for feed/browse */
export interface TaskSummary {
  id: string;
  publisher: string;
  description: string;
  tags: string[];
  payment: {
    model: PaymentModel;
    amount: number;
    currency: string;
  };
  expires: string;
  created: string;
}

// === API ===

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// === Auth ===

export interface LoginResponse {
  api_key: string;
  email: string;
}

export interface AuthStatus {
  email: string;
  authenticated: boolean;
}

// === Filters ===

export interface TaskFilters {
  tags?: string[];
  min_payout?: number;
}

// === Submissions ===

export type SubmissionStatus =
  | "pending"
  | "approved"
  | "disputed"
  | "auto_released"
  | "rejected";

export interface Submission {
  id: string;
  task_id: string;
  contributor: string;
  created: string;
  status: SubmissionStatus;
  value: number | null;
  result: unknown;
}

export interface SubmissionSummary {
  id: string;
  task_id: string;
  contributor: string;
  created: string;
  status: SubmissionStatus;
  value: number | null;
}
