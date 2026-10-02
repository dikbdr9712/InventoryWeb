import { Component, computed, input } from '@angular/core';

type Block = { kind: 'h1' | 'h2' | 'p'; text: string } | { kind: 'list'; items: string[] };

// Shows an agreement's plain text as headings, paragraphs and lists.
// It builds the page from the text itself (never inserts HTML), so nothing in the text can run as code.
//   "# Title"   big heading       "## Section"   section heading
//   "- item"    list item         blank line    new paragraph
@Component({
  selector: 'app-terms-text',
  template: `
    <div class="terms-text">
      @for (b of blocks(); track $index) {
        @switch (b.kind) {
          @case ('h1') { <h2 class="t-h1">{{ $any(b).text }}</h2> }
          @case ('h2') { <h3 class="t-h2">{{ $any(b).text }}</h3> }
          @case ('list') { <ul>@for (item of $any(b).items; track $index) { <li>{{ item }}</li> }</ul> }
          @default { <p>{{ $any(b).text }}</p> }
        }
      }
    </div>`,
  styles: [`
    .terms-text { line-height: 1.6; color: var(--ink); }
    .t-h1 { margin: 0 0 12px; font-size: 1.45rem; }
    .t-h2 { margin: 20px 0 6px; font-size: 1.05rem; }
    p { margin: 0 0 10px; }
    ul { margin: 0 0 10px; padding-left: 20px; }
    li { margin-bottom: 4px; }
  `]
})
export class TermsText {
  body = input<string>('');
  hideTitle = input(false); // when the page shows the title itself

  blocks = computed<Block[]>(() => {
    const blocks: Block[] = [];
    let paragraph: string[] = [];
    let list: string[] | null = null;
    const flush = () => {
      if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join(' ') });
      paragraph = [];
      if (list) blocks.push({ kind: 'list', items: list });
      list = null;
    };
    for (const raw of (this.body() ?? '').replace(/\r\n/g, '\n').split('\n')) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      if (line.startsWith('## ')) { flush(); blocks.push({ kind: 'h2', text: line.slice(3) }); continue; }
      if (line.startsWith('# ')) { flush(); if (!this.hideTitle()) blocks.push({ kind: 'h1', text: line.slice(2) }); continue; }
      if (line.startsWith('- ')) {
        if (paragraph.length) { blocks.push({ kind: 'p', text: paragraph.join(' ') }); paragraph = []; }
        (list ??= []).push(line.slice(2));
        continue;
      }
      if (list) { blocks.push({ kind: 'list', items: list }); list = null; }
      paragraph.push(line);
    }
    flush();
    return blocks;
  });
}
