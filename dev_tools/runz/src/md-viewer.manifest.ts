export type MdViewerScanRoot = '.' | 'docs' | '_bmad-output';

export type MdViewerScanRootOption = {
  id: MdViewerScanRoot;
  label: string;
  description: string;
};

export const MD_VIEWER_SCAN_ROOTS: readonly MdViewerScanRootOption[] = [
  {
    id: '_bmad-output',
    label: '_bmad-output',
    description: 'BMAD planning and implementation artifacts',
  },
  {
    id: 'docs',
    label: 'docs',
    description: 'Project documentation',
  },
  {
    id: '.',
    label: 'Project root',
    description: 'Markdown files in the repository root only (non-recursive)',
  },
] as const;

export function mdViewerScanRootLabel(scanRoot: MdViewerScanRoot): string {
  return MD_VIEWER_SCAN_ROOTS.find((option) => option.id === scanRoot)?.label ?? scanRoot;
}
