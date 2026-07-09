import type { SkillResult } from '../types/skill';

export type SkillRunInput = {
  data: string;
  secret: string;
};

export type BackgroundTask = {
  id: string;
  html?: string;
  uri?: string;
  bridge: string;
};

type TaskListener = (task: BackgroundTask | null) => void;

type PendingTask = {
  id: string;
  resolve: (result: SkillResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export const buildSkillBridge = (taskId: string, input: SkillRunInput): string => {
  const data = JSON.stringify(input.data ?? '');
  const secret = JSON.stringify(input.secret ?? '');
  return `(function(){
    const taskId=${JSON.stringify(taskId)};
    const data=${data};
    const secret=${secret};
    const normalize=function(value){
      if(value&&typeof value==='object'&&('result'in value||'error'in value||'image'in value||'webview'in value)){return value;}
      if(typeof value==='string'){
        const t=value.trim();
        if(t.startsWith('{')){try{return normalize(JSON.parse(t));}catch(e){}}
        return{result:value};
      }
      return{result:JSON.stringify(value??'')};
    };
    const send=function(payload){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'skill_result',taskId:taskId,payload:payload}));
    };
    const parseOut=function(value){
      if(typeof value==='string'){try{return normalize(JSON.parse(value));}catch(e){return normalize(value);}}
      return normalize(value);
    };
    const pickRunner=function(){
      if(typeof window.ai_edge_gallery_get_result==='function'){return 'gallery';}
      if(typeof window.runSkill==='function'){return 'runSkill';}
      if(typeof window.run==='function'){return 'run';}
      if(window.skill&&typeof window.skill.run==='function'){return 'skill';}
      return '';
    };
    const run=async function(){
      let mode='';
      for(let i=0;i<40;i+=1){
        mode=pickRunner();
        if(mode){break;}
        await new Promise(function(r){setTimeout(r,50);});
      }
      if(!mode){
        send({error:'skill_runner_missing'});
        return;
      }
      try{
        let value;
        if(mode==='gallery'){
          value=await window.ai_edge_gallery_get_result(data,secret);
        }else{
          let parsed={};
          try{parsed=JSON.parse(data||'{}');}catch(e){parsed={raw:data};}
          const runner=mode==='runSkill'?window.runSkill:mode==='run'?window.run:window.skill.run.bind(window.skill);
          value=await runner(parsed);
        }
        send(parseOut(value));
      }catch(error){
        send({error:error instanceof Error?error.message:String(error)});
      }
    };
    if(document.readyState==='complete'||document.readyState==='interactive'){
      setTimeout(run,0);
    }else{
      window.addEventListener('load',function(){setTimeout(run,0);},{once:true});
    }
  })();true;`;
};

export class WebViewManager {
  private activeTask: BackgroundTask | null = null;
  private isReady = false;
  private listeners = new Set<TaskListener>();
  private readyWaiters: Array<() => void> = [];
  private pendingTask: PendingTask | null = null;

  private emit() {
    for (const listener of this.listeners) {
      listener(this.activeTask);
    }
  }

  private sanitizeHtml(html: string): string {
    return html
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<embed[\s\S]*?>/gi, '')
      .replace(/<object[\s\S]*?<\/object>/gi, '');
  }

  private buildInlineHtml(taskId: string, html: string, bridge: string): string {
    const sanitizedHtml = this.sanitizeHtml(html);
    if (sanitizedHtml.includes('</body>')) {
      return sanitizedHtml.replace('</body>', `<script>${bridge}</script></body>`);
    }
    if (sanitizedHtml.includes('</html>')) {
      return sanitizedHtml.replace('</html>', `<script>${bridge}</script></html>`);
    }
    return `${sanitizedHtml}<script>${bridge}</script>`;
  }

  private clearPendingTask(taskId?: string) {
    if (this.pendingTask && (!taskId || this.pendingTask.id === taskId)) {
      clearTimeout(this.pendingTask.timer);
      this.pendingTask = null;
    }
    if (!taskId || this.activeTask?.id === taskId) {
      this.activeTask = null;
      this.emit();
    }
  }

  private waitUntilReady(timeoutMs = 5000): Promise<void> {
    if (this.isReady) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter(waiter => waiter !== onReady);
        reject(new Error('skill_runtime_unavailable'));
      }, timeoutMs);

      const onReady = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.readyWaiters.push(onReady);
    });
  }

  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    listener(this.activeTask);
    return () => {
      this.listeners.delete(listener);
    };
  }

  markReady(taskId?: string): void {
    if (taskId && this.activeTask?.id && this.activeTask.id !== taskId) {
      return;
    }
    if (!this.isReady) {
      this.isReady = true;
      const waiters = [...this.readyWaiters];
      this.readyWaiters = [];
      waiters.forEach(waiter => waiter());
    }
  }

  getTask(): BackgroundTask | null {
    return this.activeTask;
  }

  async runSkill(opts: {
    html?: string;
    uri?: string;
    input: SkillRunInput;
  }, timeoutMs = 30000): Promise<SkillResult> {
    if (this.pendingTask) {
      throw new Error('skill_runtime_busy');
    }
    if (!opts.html && !opts.uri) {
      throw new Error('skill_runtime_empty');
    }

    await this.waitUntilReady();

    const taskId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const bridge = buildSkillBridge(taskId, opts.input);

    return new Promise<SkillResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.clearPendingTask(taskId);
        reject(new Error('skill_runtime_timeout'));
      }, timeoutMs);

      this.pendingTask = {
        id: taskId,
        resolve,
        reject,
        timer,
      };
      this.isReady = false;
      this.activeTask = {
        id: taskId,
        uri: opts.uri,
        html: opts.html ? this.buildInlineHtml(taskId, opts.html, bridge) : undefined,
        bridge: opts.uri ? bridge : '',
      };
      console.log('skill_task_start', taskId, opts.uri ? 'uri' : 'html');
      this.emit();
    });
  }

  async runSkillHtml(html: string, input: SkillRunInput, timeoutMs = 30000): Promise<SkillResult> {
    return this.runSkill({ html, input }, timeoutMs);
  }

  handleMessage(message: string): void {
    let parsed: { type?: string; taskId?: string; payload?: SkillResult };

    try {
      parsed = JSON.parse(message) as { type?: string; taskId?: string; payload?: SkillResult };
    } catch {
      if (this.pendingTask) {
        const { resolve, id } = this.pendingTask;
        this.clearPendingTask(id);
        resolve({ result: message });
      }
      return;
    }

    if (!this.pendingTask || parsed.type !== 'skill_result' || parsed.taskId !== this.pendingTask.id) {
      return;
    }

    const { resolve, id } = this.pendingTask;
    this.clearPendingTask(id);
    console.log('skill_task_done', id);
    resolve(parsed.payload || {});
  }

  async stop(): Promise<void> {
    if (this.pendingTask) {
      const { reject, id } = this.pendingTask;
      this.clearPendingTask(id);
      reject(new Error('skill_runtime_stopped'));
    }

    this.isReady = false;
  }

  getStatus() {
    return {
      isReady: this.isReady,
      hasTask: !!this.activeTask,
      isBusy: !!this.pendingTask,
    };
  }

  isWebViewReady() {
    return this.isReady;
  }
}

export const backgroundWebViewManager = new WebViewManager();
