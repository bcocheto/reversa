import compileCommand from './compile.js';
import exportPackageCommand from './export-package.js';

export default async function exportCommand(args = []) {
  if (args.includes('--package')) {
    return exportPackageCommand(args.filter((arg) => arg !== '--package'));
  }
  return compileCommand(args);
}
