import type { ToolRisk, ToolSource } from '../tools/ToolRegistry';

export type ApprovalRequest = {
  requestId: string;
  tool: string;
  source: ToolSource;
  risk: ToolRisk;
  summary: string;
};

export type ApprovalPresenter = (request: ApprovalRequest) => Promise<boolean>;

class ToolApprovalClass {
  private presenter: ApprovalPresenter | null = null;
  private foreground = true;

  setPresenter(presenter: ApprovalPresenter | null): void {
    console.log('approval_presenter', !!presenter);
    this.presenter = presenter;
  }

  setForeground(active: boolean): void {
    this.foreground = active;
  }

  isForeground(): boolean {
    return this.foreground;
  }

  async request(request: ApprovalRequest): Promise<boolean> {
    if (request.risk === 'read') {
      return true;
    }
    if (!this.foreground) {
      console.log('approval_background_denied');
      return false;
    }
    if (!this.presenter) {
      console.log('approval_missing');
      return false;
    }
    console.log('approval_ask', request.tool);
    return this.presenter(request);
  }
}

export const toolApproval = new ToolApprovalClass();
