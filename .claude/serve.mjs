// Starts `ng serve` on the port the preview pane assigns (PORT), so it never clashes with a copy already on 4200.
// Extra arguments are passed on, for example `--configuration production` to try the real build.
import { spawn } from 'node:child_process';

const port = process.env.PORT || '4200';
const ng = spawn(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'serve', '--port', port, ...process.argv.slice(2)], { stdio: 'inherit' });
ng.on('exit', code => process.exit(code ?? 0));
