import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../main.dart';
import '../models/task.dart';

class TaskDialog extends StatefulWidget {
  final Task? task;
  final DateTime? defaultDate;

  const TaskDialog({super.key, this.task, this.defaultDate});

  static Future<bool?> show(
    BuildContext context, {
    Task? task,
    DateTime? defaultDate,
  }) {
    return showDialog<bool>(
      context: context,
      builder: (_) => TaskDialog(task: task, defaultDate: defaultDate),
    );
  }

  @override
  State<TaskDialog> createState() => _TaskDialogState();
}

class _TaskDialogState extends State<TaskDialog> {
  late final TextEditingController _titleCtrl;
  late final TextEditingController _descCtrl;
  DateTime? _dueDate;
  Priority? _priority;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController(text: widget.task?.title ?? '');
    _descCtrl = TextEditingController(text: widget.task?.description ?? '');
    _dueDate = widget.task?.dueDate ?? widget.defaultDate;
    _priority = widget.task?.priority;
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final title = _titleCtrl.text.trim();
    if (title.isEmpty) return;

    setState(() => _saving = true);
    final payload = {
      'title': title,
      'description': _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
      'due_date': _dueDate != null ? Task.formatIso(_dueDate!) : null,
      'priority': _priority?.value,
    };

    try {
      if (widget.task != null) {
        await supabase
            .from('tasks')
            .update(payload)
            .eq('id', widget.task!.id);
      } else {
        final userId = supabase.auth.currentUser!.id;
        await supabase.from('tasks').insert({
          ...payload,
          'user_id': userId,
        });
      }
      if (mounted) Navigator.of(context).pop(true);
    } on PostgrestException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueDate ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 5)),
    );
    if (picked != null) setState(() => _dueDate = picked);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.task == null ? 'New task' : 'Edit task'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _titleCtrl,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Title',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Description (optional)',
                border: OutlineInputBorder(),
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.calendar_today, size: 16),
                    label: Text(
                      _dueDate == null ? 'No date' : formatDueDate(_dueDate),
                    ),
                    onPressed: _pickDate,
                  ),
                ),
                if (_dueDate != null)
                  IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () => setState(() => _dueDate = null),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<Priority?>(
              initialValue: _priority,
              decoration: const InputDecoration(
                labelText: 'Priority',
                border: OutlineInputBorder(),
              ),
              items: [
                const DropdownMenuItem(value: null, child: Text('None')),
                ...Priority.values.map(
                  (p) => DropdownMenuItem(
                    value: p,
                    child: Row(
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: p.color,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(p.label),
                      ],
                    ),
                  ),
                ),
              ],
              onChanged: (v) => setState(() => _priority = v),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: Text(widget.task == null ? 'Add' : 'Save'),
        ),
      ],
    );
  }
}
