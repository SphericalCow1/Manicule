import assert from "node:assert/strict";
import test from "node:test";

import { renderCheckboxItems } from "../src/lib/markdownRendering.js";

test("renders markdown task list markers as clickable checkboxes", () => {
  assert.equal(
    renderCheckboxItems(
      "<ul>\n<li>[ ] Open task</li>\n<li>[x] Closed task</li>\n</ul>\n",
      "- [ ] Open task\n- [x] Closed task",
    ),
    '<ul>\n<li class="task-list-item"><input class="task-list-checkbox" type="checkbox" data-line="1" aria-label="Unchecked task" /> Open task</li>\n<li class="task-list-item"><input class="task-list-checkbox" type="checkbox" checked data-line="2" aria-label="Checked task" /> Closed task</li>\n</ul>\n',
  );
});

test("keeps checkbox source lines in rendered order when states are mixed", () => {
  assert.equal(
    renderCheckboxItems(
      "<ul>\n<li>[x] First</li>\n<li>[ ] Second</li>\n<li>[x] Third</li>\n</ul>\n",
      "- [x] First\n- [ ] Second\n- [x] Third",
    ),
    '<ul>\n<li class="task-list-item"><input class="task-list-checkbox" type="checkbox" checked data-line="1" aria-label="Checked task" /> First</li>\n<li class="task-list-item"><input class="task-list-checkbox" type="checkbox" data-line="2" aria-label="Unchecked task" /> Second</li>\n<li class="task-list-item"><input class="task-list-checkbox" type="checkbox" checked data-line="3" aria-label="Checked task" /> Third</li>\n</ul>\n',
  );
});

test("renders checkbox source lines from backlink line maps", () => {
  assert.equal(
    renderCheckboxItems(
      "<ul>\n<li>[ ] Parent</li>\n<li>[x] Child</li>\n</ul>\n",
      "- [ ] Parent\n  - [x] Child",
      [8, 13],
    ),
    '<ul>\n<li class="task-list-item"><input class="task-list-checkbox" type="checkbox" data-line="8" aria-label="Unchecked task" /> Parent</li>\n<li class="task-list-item"><input class="task-list-checkbox" type="checkbox" checked data-line="13" aria-label="Checked task" /> Child</li>\n</ul>\n',
  );
});
