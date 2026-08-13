import { Document, Packer, Paragraph, TextRun } from "https://cdn.jsdelivr.net/npm/docx@9.7.1/+esm";

export async function buildAssignmentDoc({ project, lsuId }) {
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ children: [new TextRun("COMMUNITIES AND CRIME")] }),
    new Paragraph({ children: [new TextRun(`LSU ID: ${lsuId}`)] }),
    new Paragraph({ children: [new TextRun(project.city)] })
  ] }] });
  return Packer.toBlob(doc);
}
