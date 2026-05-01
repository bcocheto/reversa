import compileCommand from './compile.js';

export default async function exportCommand(args = []) {
  return compileCommand(args);
}
