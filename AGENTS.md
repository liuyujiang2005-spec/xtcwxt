<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:sync-rules -->
# 代码同步铁律

1. **永远不要用 `git reset --hard` 或任何会丢弃本地修改的命令**，除非用户明确要求。
2. 本地和远程有冲突时，**必须先告诉用户哪些文件冲突**，让用户决定保留哪个版本。
3. 推送代码前，确认本地改动用户已知情。
<!-- END:sync-rules -->
