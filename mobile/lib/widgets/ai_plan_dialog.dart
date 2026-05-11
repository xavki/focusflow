import 'package:flutter/material.dart';

import '../main.dart';
import '../models/task.dart';
import '../services/ai_plan.dart';

class AIPlanDialog extends StatefulWidget {
  const AIPlanDialog({super.key});

  static Future<void> show(BuildContext context) {
    return showDialog(
      context: context,
      builder: (_) => const Dialog(child: AIPlanDialog()),
    );
  }

  @override
  State<AIPlanDialog> createState() => _AIPlanDialogState();
}

class _AIPlanDialogState extends State<AIPlanDialog> {
  final _promptCtrl = TextEditingController();
  bool _loading = false;
  String? _error;
  List<SuggestedTask>? _suggestions;
  final Set<int> _selected = {};

  @override
  void dispose() {
    _promptCtrl.dispose();
    super.dispose();
  }

  Future<void> _generate() async {
    final prompt = _promptCtrl.text.trim();
    if (prompt.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final tasks = await generatePlan(prompt);
      setState(() {
        _suggestions = tasks;
        _selected.addAll(List.generate(tasks.length, (i) => i));
      });
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addAll() async {
    if (_suggestions == null || _selected.isEmpty) return;
    setState(() => _loading = true);
    try {
      final userId = supabase.auth.currentUser!.id;
      final rows = _selected
          .map((i) => _suggestions![i].toInsertRow(userId))
          .toList();
      await supabase.from('tasks').insert(rows);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  '✨ Plan with AI',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            _suggestions == null
                ? 'Describe your goal and let AI break it down.'
                : '${_selected.length} of ${_suggestions!.length} tasks selected.',
            style: const TextStyle(color: Colors.grey, fontSize: 12),
          ),
          const SizedBox(height: 16),
          if (_suggestions == null)
            TextField(
              controller: _promptCtrl,
              maxLines: 4,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: 'e.g. I want to prepare my final exam in 3 weeks…',
                border: OutlineInputBorder(),
              ),
            )
          else
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.5,
              ),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: _suggestions!.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final s = _suggestions![i];
                  final isSelected = _selected.contains(i);
                  return Card(
                    margin: EdgeInsets.zero,
                    color: isSelected
                        ? Theme.of(context).colorScheme.primaryContainer
                        : null,
                    child: InkWell(
                      onTap: () => setState(() {
                        if (isSelected) {
                          _selected.remove(i);
                        } else {
                          _selected.add(i);
                        }
                      }),
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Checkbox(
                              value: isSelected,
                              onChanged: (_) => setState(() {
                                if (isSelected) {
                                  _selected.remove(i);
                                } else {
                                  _selected.add(i);
                                }
                              }),
                            ),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      if (s.priority != null) ...[
                                        Container(
                                          width: 8,
                                          height: 8,
                                          decoration: BoxDecoration(
                                            color: s.priority!.color,
                                            shape: BoxShape.circle,
                                          ),
                                        ),
                                        const SizedBox(width: 6),
                                      ],
                                      Expanded(
                                        child: Text(
                                          s.title,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (s.description != null)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 2),
                                      child: Text(
                                        s.description!,
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: Colors.grey,
                                        ),
                                      ),
                                    ),
                                  if (s.dueDate != null)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Text(
                                        '📅 ${formatDueDate(s.dueDate)}',
                                        style: const TextStyle(fontSize: 11),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12)),
          ],
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (_suggestions != null)
                TextButton(
                  onPressed: _loading
                      ? null
                      : () => setState(() {
                            _suggestions = null;
                            _selected.clear();
                          }),
                  child: const Text('← Back'),
                )
              else
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _loading
                    ? null
                    : (_suggestions == null ? _generate : _addAll),
                child: _loading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(
                        _suggestions == null
                            ? 'Generate'
                            : 'Add ${_selected.length}',
                      ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
