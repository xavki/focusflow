import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../main.dart';
import '../models/task.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Task> _tasks = [];
  TaskFilter _filter = TaskFilter.all;
  bool _loading = true;
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    if (_channel != null) supabase.removeChannel(_channel!);
    super.dispose();
  }

  Future<void> _init() async {
    await _fetchTasks();
    _subscribeRealtime();
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _fetchTasks() async {
    final data = await supabase
        .from('tasks')
        .select()
        .order('due_date', ascending: true, nullsFirst: false)
        .order('created_at', ascending: false);
    if (!mounted) return;
    setState(() {
      _tasks = (data as List).map((m) => Task.fromMap(m)).toList();
    });
  }

  void _subscribeRealtime() {
    final userId = supabase.auth.currentUser!.id;

    _channel = supabase
        .channel('tasks-changes')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'tasks',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'user_id',
            value: userId,
          ),
          callback: (payload) {
            if (!mounted) return;
            switch (payload.eventType) {
              case PostgresChangeEvent.insert:
                final task = Task.fromMap(payload.newRecord);
                setState(() {
                  if (!_tasks.any((t) => t.id == task.id)) {
                    _tasks = [task, ..._tasks];
                  }
                });
                break;
              case PostgresChangeEvent.update:
                final task = Task.fromMap(payload.newRecord);
                setState(() {
                  _tasks = _tasks.map((t) => t.id == task.id ? task : t).toList();
                });
                break;
              case PostgresChangeEvent.delete:
                final id = payload.oldRecord['id'] as String?;
                if (id == null) return;
                setState(() {
                  _tasks = _tasks.where((t) => t.id != id).toList();
                });
                break;
              default:
                break;
            }
          },
        )
        .subscribe();
  }

  List<Task> get _filteredTasks {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final inWeek = today.add(const Duration(days: 7));
    switch (_filter) {
      case TaskFilter.today:
        return _tasks.where((t) {
          if (t.dueDate == null) return false;
          final d = DateTime(t.dueDate!.year, t.dueDate!.month, t.dueDate!.day);
          return d == today;
        }).toList();
      case TaskFilter.week:
        return _tasks.where((t) {
          if (t.dueDate == null) return false;
          final d = DateTime(t.dueDate!.year, t.dueDate!.month, t.dueDate!.day);
          return !d.isBefore(today) && !d.isAfter(inWeek);
        }).toList();
      case TaskFilter.noDate:
        return _tasks.where((t) => t.dueDate == null).toList();
      case TaskFilter.all:
        return _tasks;
    }
  }

  Future<void> _addTask(String title, DateTime? dueDate) async {
    final trimmed = title.trim();
    if (trimmed.isEmpty) return;
    final userId = supabase.auth.currentUser!.id;
    try {
      await supabase.from('tasks').insert({
        'title': trimmed,
        'user_id': userId,
        'due_date': dueDate != null ? Task.formatIso(dueDate) : null,
      });
    } catch (e) {
      _showError(e.toString());
    }
  }

  Future<void> _toggleTask(Task task) async {
    try {
      await supabase
          .from('tasks')
          .update({'completed': !task.completed})
          .eq('id', task.id);
    } catch (e) {
      _showError(e.toString());
    }
  }

  Future<void> _updateTask(Task task, String newTitle, DateTime? newDate) async {
    final trimmed = newTitle.trim();
    if (trimmed.isEmpty) return;
    try {
      await supabase.from('tasks').update({
        'title': trimmed,
        'due_date': newDate != null ? Task.formatIso(newDate) : null,
      }).eq('id', task.id);
    } catch (e) {
      _showError(e.toString());
    }
  }

  Future<void> _deleteTask(Task task) async {
    try {
      await supabase.from('tasks').delete().eq('id', task.id);
    } catch (e) {
      _showError(e.toString());
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red),
    );
  }

  Future<void> _showTaskDialog({Task? task}) async {
    final titleCtrl = TextEditingController(text: task?.title ?? '');
    DateTime? selectedDate = task?.dueDate;

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocalState) => AlertDialog(
          title: Text(task == null ? 'New task' : 'Edit task'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleCtrl,
                autofocus: true,
                decoration: const InputDecoration(hintText: 'What needs doing?'),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.calendar_today, size: 16),
                      label: Text(
                        selectedDate == null
                            ? 'No date'
                            : formatDueDate(selectedDate),
                      ),
                      onPressed: () async {
                        final picked = await showDatePicker(
                          context: ctx,
                          initialDate: selectedDate ?? DateTime.now(),
                          firstDate: DateTime.now().subtract(const Duration(days: 365)),
                          lastDate: DateTime.now().add(const Duration(days: 365 * 5)),
                        );
                        if (picked != null) {
                          setLocalState(() => selectedDate = picked);
                        }
                      },
                    ),
                  ),
                  if (selectedDate != null)
                    IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      tooltip: 'Clear date',
                      onPressed: () => setLocalState(() => selectedDate = null),
                    ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(task == null ? 'Add' : 'Save'),
            ),
          ],
        ),
      ),
    );

    if (saved == true) {
      if (task == null) {
        await _addTask(titleCtrl.text, selectedDate);
      } else {
        await _updateTask(task, titleCtrl.text, selectedDate);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = supabase.auth.currentUser;
    final filtered = _filteredTasks;
    final pending = filtered.where((t) => !t.completed).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'FocusFlow',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () => supabase.auth.signOut(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showTaskDialog(),
        icon: const Icon(Icons.add),
        label: const Text('New task'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                  child: Text(
                    'Your tasks',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: Text(
                    '$pending pending · ${user?.email ?? ''}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.grey,
                        ),
                  ),
                ),
                SizedBox(
                  height: 44,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: TaskFilter.values.map((f) {
                      final selected = _filter == f;
                      return Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: ChoiceChip(
                          label: Text(f.label),
                          selected: selected,
                          onSelected: (_) => setState(() => _filter = f),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 8),
                const Divider(height: 1),
                Expanded(
                  child: filtered.isEmpty
                      ? const Center(
                          child: Text(
                            'No tasks here.\nTap + to add one.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.grey),
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.only(bottom: 80),
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, i) {
                            final task = filtered[i];
                            final overdue = isOverdue(task.dueDate, task.completed);
                            return Dismissible(
                              key: ValueKey(task.id),
                              direction: DismissDirection.endToStart,
                              background: Container(
                                color: Colors.red,
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 20),
                                child: const Icon(Icons.delete, color: Colors.white),
                              ),
                              onDismissed: (_) => _deleteTask(task),
                              child: ListTile(
                                leading: Checkbox(
                                  value: task.completed,
                                  onChanged: (_) => _toggleTask(task),
                                ),
                                title: Text(
                                  task.title,
                                  style: TextStyle(
                                    decoration: task.completed
                                        ? TextDecoration.lineThrough
                                        : null,
                                    color: task.completed ? Colors.grey : null,
                                  ),
                                ),
                                subtitle: task.dueDate != null
                                    ? Row(
                                        children: [
                                          Icon(
                                            Icons.event,
                                            size: 12,
                                            color: overdue ? Colors.red : Colors.grey,
                                          ),
                                          const SizedBox(width: 4),
                                          Text(
                                            formatDueDate(task.dueDate),
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: overdue ? Colors.red : Colors.grey,
                                              fontWeight: overdue ? FontWeight.w600 : null,
                                            ),
                                          ),
                                        ],
                                      )
                                    : null,
                                onTap: () => _showTaskDialog(task: task),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }
}
