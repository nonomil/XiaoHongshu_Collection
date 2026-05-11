import os

filepath = 'D:/Workplace/Claude/ClaudeCode_Codex_Cowork_Example/.claude/项目迁移指南--安装插件和技能.md'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

plugins_lines = ['# 安装插件和技能\n\n'] + lines[6:161]
migration_lines = lines[0:6] + lines[162:]

with open('D:/Workplace/Claude/ClaudeCode_Codex_Cowork_Example/.claude/安装插件和技能.md', 'w', encoding='utf-8') as f:
    f.writelines(plugins_lines)

with open('D:/Workplace/Claude/ClaudeCode_Codex_Cowork_Example/.claude/项目迁移指南.md', 'w', encoding='utf-8') as f:
    f.writelines(migration_lines)

os.remove(filepath)
print("Done!")
