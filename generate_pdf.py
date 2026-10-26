#!/usr/bin/env python3
"""
Generate PDF from Markdown for Biscene DSPSystem Playback Engine Specification
"""
import os
import sys
import re
from fpdf import FPDF

class MarkdownToPDF(FPDF):
    def __init__(self, font_path=None):
        super().__init__()
        self.font_path = font_path or "/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc"
        self.add_font("JP", "", self.font_path)
        self.add_font("JP", "B", self.font_path)
        # Add Menlo for code blocks
        self.add_font("Menlo", "", "/System/Library/Fonts/Menlo.ttc")
        self.add_font("Menlo", "B", "/System/Library/Fonts/Menlo.ttc")
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        if self.page_no() > 1:
            self.set_font("JP", "", 8)
            self.set_text_color(128)
            self.cell(0, 5, "Biscene DSPSystem - Playback Engine Specification", align="C")
            self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_font("JP", "", 8)
        self.set_text_color(128)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def parse_markdown(self, md_text):
        """Parse markdown and render to PDF"""
        # Pre-process: replace emojis
        md_text = self.replace_emojis(md_text)

        lines = md_text.split('\n')
        in_code_block = False
        code_lines = []
        in_table = False
        table_rows = []

        for line in lines:
            # Code block handling
            if line.strip().startswith('```'):
                if in_code_block:
                    self.render_code_block(code_lines)
                    code_lines = []
                    in_code_block = False
                else:
                    in_code_block = True
                continue

            if in_code_block:
                code_lines.append(line)
                continue

            # Table handling
            if '|' in line and line.strip().startswith('|'):
                if not in_table:
                    in_table = True
                table_rows.append(line)
                continue
            else:
                if in_table:
                    self.render_table(table_rows)
                    table_rows = []
                    in_table = False

            # Headers
            if line.startswith('# '):
                self.set_font("JP", "B", 20)
                self.set_text_color(30, 30, 30)
                self.multi_cell(0, 12, line[2:].strip())
                self.ln(4)
            elif line.startswith('## '):
                self.set_font("JP", "B", 16)
                self.set_text_color(40, 40, 40)
                self.multi_cell(0, 10, line[3:].strip())
                self.ln(3)
            elif line.startswith('### '):
                self.set_font("JP", "B", 13)
                self.set_text_color(50, 50, 50)
                self.multi_cell(0, 9, line[4:].strip())
                self.ln(2)
            elif line.startswith('#### '):
                self.set_font("JP", "B", 11)
                self.set_text_color(60, 60, 60)
                self.multi_cell(0, 8, line[5:].strip())
                self.ln(2)
            # Horizontal rule
            elif line.strip() == '---' or line.strip() == '***':
                self.ln(2)
                self.set_draw_color(200, 200, 200)
                self.line(10, self.get_y(), 200, self.get_y())
                self.ln(4)
            # Bullet points
            elif re.match(r'^[\s]*[-*+]\s+', line):
                self.render_bullet(line)
            # Numbered list
            elif re.match(r'^[\s]*\d+\.\s+', line):
                self.render_numbered(line)
            # Diagram/ASCII art
            elif self.is_diagram_line(line):
                self.render_diagram_line(line)
            # Regular paragraph
            else:
                self.render_paragraph(line)

        # Flush any remaining
        if in_code_block and code_lines:
            self.render_code_block(code_lines)
        if in_table and table_rows:
            self.render_table(table_rows)

    def replace_emojis(self, text):
        """Replace emojis with text equivalents for font compatibility"""
        replacements = {
            '✅': '[OK]',
            '❌': '[NG]',
            '⚠️': '[!]',
            '⚠': '[!]',
            '△': '[~]',
            '≥': '>=',
            '→': '->',
            '🔄': '[refresh]',
            '📱': '[mobile]',
            '🔧': '[tool]',
            '🎵': '[music]',
            '📊': '[chart]',
            '🔒': '[lock]',
            '🌐': '[web]',
            '⚡': '[fast]',
            '🎯': '[target]',
            '📝': '[memo]',
            '🚀': '[rocket]',
            '💡': '[idea]',
            '🔍': '[search]',
            '⭐': '[star]',
        }
        for emoji, repl in replacements.items():
            text = text.replace(emoji, repl)
        # Also remove variation selector
        text = text.replace('\ufe0f', '')
        return text

    def is_diagram_line(self, line):
        """Check if line is part of ASCII diagram"""
        diagram_chars = set('┌┐└┘├┤┬┴┼─│━┃┄┅┆┇┈┉┊┋┍┎┏┐┑┒┓└┕┖┗┘┙┚┛├┝┞┟┠┡┢┣┤┥┦┧┨┩┪┫┬┭┮┯┰┱┲┳┴┵┶┷┸┹┺┻┼┽┾┿')
        return any(c in diagram_chars for c in line) or line.strip().startswith(('├', '└', '┌', '│', '┤', '┬', '┴', '┼'))

    def render_diagram_line(self, line):
        self.set_font("Menlo", "", 7)
        self.set_text_color(80, 80, 80)
        self.set_fill_color(245, 245, 245)
        x = self.get_x()
        # Truncate if too long
        max_chars = 110
        if len(line) > max_chars:
            line = line[:max_chars] + '...'
        self.cell(190, 4.5, line, fill=True)
        self.ln(4.5)
        self.set_font("JP", "", 10)
        self.set_text_color(30, 30, 30)

    def render_bullet(self, line):
        self.set_font("JP", "", 10)
        self.set_text_color(30, 30, 30)
        indent = len(line) - len(line.lstrip())
        bullet_text = line.strip()[2:].strip()
        bullet_text = self.process_inline(bullet_text)
        x = self.get_x()
        self.set_x(x + 5 + indent * 0.5)
        self.cell(5, 5, "\u2022")
        self.multi_cell(0, 5, bullet_text)
        self.ln(1)

    def render_numbered(self, line):
        self.set_font("JP", "", 10)
        self.set_text_color(30, 30, 30)
        match = re.match(r'^[\s]*(\d+)\.\s+(.*)', line)
        if match:
            num, text = match.groups()
            text = self.process_inline(text)
            x = self.get_x()
            self.set_x(x + 5)
            self.cell(8, 5, f"{num}.")
            self.multi_cell(0, 5, text)
            self.ln(1)

    def render_paragraph(self, line):
        if not line.strip():
            self.ln(3)
            return
        self.set_font("JP", "", 10)
        self.set_text_color(30, 30, 30)
        text = self.process_inline(line)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def process_inline(self, text):
        """Process inline markdown formatting"""
        # Bold
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
        # Italic
        text = re.sub(r'\*(.+?)\*', r'\1', text)
        # Inline code
        text = re.sub(r'`(.+?)`', r'\1', text)
        # Strikethrough
        text = re.sub(r'~~(.+?)~~', r'\1', text)
        return text

    def render_code_block(self, lines):
        self.set_fill_color(240, 240, 240)
        self.set_font("Menlo", "", 7.5)
        self.set_text_color(50, 50, 50)
        for code_line in lines:
            x = self.get_x()
            self.set_x(x + 10)
            # Truncate long lines
            if len(code_line) > 100:
                code_line = code_line[:100] + '...'
            self.cell(170, 4.5, code_line, fill=True)
            self.ln(4.5)
        self.ln(3)
        self.set_font("JP", "", 10)
        self.set_text_color(30, 30, 30)

    def render_table(self, rows):
        if not rows:
            return

        # Parse table - handle markdown table format
        parsed_rows = []
        for row in rows:
            cells = [c.strip() for c in row.split('|')]
            # Remove empty first/last
            if cells and cells[0] == '':
                cells = cells[1:]
            if cells and cells[-1] == '':
                cells = cells[:-1]
            if cells:
                parsed_rows.append(cells)

        if not parsed_rows:
            return

        # Check if it's a separator row (---)
        def is_separator(row):
            return all(re.match(r'^[-:]+$', c.strip()) for c in row)

        # Filter out separator rows
        data_rows = [r for r in parsed_rows if not is_separator(r)]

        if not data_rows:
            return

        col_count = len(data_rows[0])
        page_width = 190

        # Calculate column widths based on content
        col_widths = []
        for i in range(col_count):
            max_len = max(len(self.process_inline(str(row[i]))) for row in data_rows if i < len(row))
            # Estimate width: 1 char ≈ 2.2mm at font size 8
            width = min(max(max_len * 2.2, 15), 60)
            col_widths.append(width)

        # Normalize to page width
        total = sum(col_widths)
        if total > page_width:
            col_widths = [w * page_width / total for w in col_widths]

        # Header row
        self.set_font("JP", "B", 7.5)
        self.set_fill_color(50, 80, 120)
        self.set_text_color(255, 255, 255)
        for i, cell in enumerate(data_rows[0]):
            text = self.process_inline(str(cell))[:35]
            self.cell(col_widths[i], 7, text, border=1, fill=True, align="C")
        self.ln()

        # Data rows
        self.set_font("JP", "", 7.5)
        self.set_text_color(30, 30, 30)
        fill = False
        for row in data_rows[1:]:
            if fill:
                self.set_fill_color(245, 245, 250)
            else:
                self.set_fill_color(255, 255, 255)
            max_h = 6
            # Calculate row height
            for i, cell in enumerate(row):
                text = self.process_inline(str(cell))
                # Estimate lines needed
                chars_per_line = col_widths[i] / 2.2
                lines_needed = max(1, len(text) / chars_per_line + 0.5)
                h = lines_needed * 5
                max_h = max(max_h, h)

            max_h = min(max_h, 30)  # Cap row height

            x_start = self.get_x()
            y_start = self.get_y()

            # Check if we need a new page
            if y_start + max_h > 270:
                self.add_page()
                y_start = self.get_y()

            for i, cell in enumerate(row):
                text = self.process_inline(str(cell))
                self.set_xy(x_start + sum(col_widths[:i]), y_start)
                self.multi_cell(col_widths[i], 5, text, border=1, fill=True, align="L")

            self.set_y(y_start + max_h)
            fill = not fill
        self.ln(3)

def generate_pdf(md_path, pdf_path, font_path=None):
    pdf = MarkdownToPDF(font_path)
    pdf.alias_nb_pages()
    pdf.add_page()

    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    pdf.parse_markdown(md_content)
    pdf.output(pdf_path)
    print(f"Generated: {pdf_path}")

if __name__ == "__main__":
    base_dir = "/Users/user/Library/Caches/Google/AndroidStudio2026.1.3/projects/android.bc76a6ac/.artifacts/0fa27d5a-82b5-4f9e-b269-3756e82d3401"
    project_dir = "/Users/user/Desktop/BisceneDSPSystem"

    font_path = "/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc"

    # Japanese version
    generate_pdf(
        os.path.join(base_dir, "PLAYBACK_SYSTEM_SPEC.md"),
        os.path.join(project_dir, "PLAYBACK_SYSTEM_SPEC_JP.pdf"),
        font_path
    )

    # English version
    generate_pdf(
        os.path.join(base_dir, "PLAYBACK_SYSTEM_SPEC_EN.md"),
        os.path.join(project_dir, "PLAYBACK_SYSTEM_SPEC_EN.pdf"),
        font_path
    )

    print("Done!")