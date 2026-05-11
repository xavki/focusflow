import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../main.dart';
import '../models/task.dart';
import '../widgets/task_dialog.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Task> _tasks = [];
  TaskFilter _filter = TaskFilter.all;
  String _search = '';
  bool _loading = true;
  RealtimeChannel? _channel;
  final _searchCtrl = TextEditingController();
  bool _selectMode = false;
  final Set<String> _selected = {};

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    if (_channel != null) supabase.removeChannel(_channel!);
    _searchCtrl.dispose();
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
        .channel('tasks-home')
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
    final q = _search.trim().toLowerCase();

    var result = _tasks;

    if (q.isNotEmpty) {
      result = result.where((t) {
        return t.title.toLowerCase().contains(q) ||
            (t.description?.toLowerCase().contains(q) ?? false);
      }).toList();
    }

    switch (_filter) {
      case TaskFilter.today:
        return result.where((t) {
          if (t.dueDate == null) return false;
          final d = DateTime(t.dueDate!.year, t.dueDate!.month, t.dueDate!.day);
          return d == today;
        }).toList();
      case TaskFilter.week:
        return result.where((t) {
          if (t.dueDate == null) return false;
          final d = DateTime(t.dueDate!.year, t.dueDate!.month, t.dueDate!.day);
          return !d.isBefore(today) && !d.isAfter(inWeek);
        }).toList();
      case TaskFilter.noDate:
        return result.where((t) => t.dueDate == null).toList();
      case TaskFilter.all:
        return result;
    }
  }

  Future<void> _toggleTask(Task task) async {
    setState(() {
      _tasks = _tasks
          .map((t) => t.id == task.id
              ? Task(
                  id: t.id,
                  userId: t.userId,
                  title: t.title,
                  description: t.description,
                  priority: t.priority,
                  completed: !t.completed,
                  dueDate: t.dueDate,
                  createdAt: t.createdAt,
                )
              : t)
          .toList();
    });
    try {
      await supabase
          .from('tasks')
          .update({'completed': !task.completed})
          .eq('id', task.id);
    } catch (e) {
      setState(() {
        _tasks = _tasks
            .map((t) => t.id == task.id ? task : t)
            .toList();
      });
      _showError(e.toString());
    }
  }

  Future<void> _deleteTask(Task task) async {
    final backup = List<Task>.from(_tasks);
    setState(() => _tasks = _tasks.where((t) => t.id != task.id).toList());
    try {
      await supabase.from('tasks').delete().eq('id', task.id);
    } catch (e) {
      setState(() => _tasks = backup);
      _showError(e.toString());
    }
  }

  void _toggleSelected(String id) {
    setState(() {
      if (_selected.contains(id)) {
        _selected.remove(id);
      } else {
        _selected.add(id);
      }
    });
  }

  void _exitSelectMode() {
    setState(() {
      _selectMode = false;
      _selected.clear();
    });
  }

  Future<void> _deleteSelected() async {
    if (_selected.isEmpty) return;
    final ids = _selected.toList();
    final backup = List<Task>.from(_tasks);
    setState(() {
      _tasks = _tasks.where((t) => !_selected.contains(t.id)).toList();
      _selectMode = false;
      _selected.clear();
    });
    try {
      await supabase.from('tasks').delete().inFilter('id', ids);
    } catch (e) {
      setState(() => _tasks = backup);
      _showError(e.toString());
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = supabase.auth.currentUser;
    final filtered = _filteredTasks;
    final pending = filtered.where((t) => !t.completed).length;

    return Scaffold(
      appBar: _selectMode
          ? AppBar(
              leading: IconButton(
                icon: const Icon(Icons.close),
                onPressed: _exitSelectMode,
              ),
              title: Text(
                '${_selected.length} selected',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              backgroundColor: Theme.of(context).colorScheme.errorContainer,
              foregroundColor: Theme.of(context).colorScheme.onErrorContainer,
              actions: [
                IconButton(
                  icon: const Icon(Icons.delete_outline),
                  tooltip: 'Delete selected',
                  onPressed: _selected.isEmpty ? null : _deleteSelected,
                ),
              ],
            )
          : AppBar(
              title: const Text(
                'FocusFlow',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.checklist),
                  tooltip: 'Select multiple',
                  onPressed: () => setState(() => _selectMode = true),
                ),
                ValueListenableBuilder<ThemeMode>(
                  valueListenable: themeMode,
                  builder: (_, mode, __) => IconButton(
                    icon: Icon(themeIcon(mode)),
                    tooltip: 'Theme: ${mode.name}',
                    onPressed: toggleTheme,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.logout),
                  tooltip: 'Sign out',
                  onPressed: () => supabase.auth.signOut(),
                ),
              ],
            ),
      floatingActionButton: _selectMode
          ? null
          : FloatingActionButton.extended(
              onPressed: () => TaskDialog.show(context),
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
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: TextField(
                    controller: _searchCtrl,
                    decoration: InputDecoration(
                      hintText: 'Search tasks…',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      isDense: true,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      suffixIcon: _search.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.close, size: 18),
                              onPressed: () {
                                _searchCtrl.clear();
                                setState(() => _search = '');
                              },
                            )
                          : null,
                    ),
                    onChanged: (v) => setState(() => _search = v),
                  ),
                ),
                const SizedBox(height: 8),
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
                const Divider(height: 1),
                Expanded(
                  child: filtered.isEmpty
                      ? Center(
                          child: Text(
                            _search.isNotEmpty
                                ? 'No tasks match your search.'
                                : 'No tasks here.\nTap + to add one.',
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.grey),
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.only(bottom: 80),
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, i) {
                            final task = filtered[i];
                            return _TaskTile(
                              task: task,
                              selectMode: _selectMode,
                              isSelected: _selected.contains(task.id),
                              onToggle: () => _toggleTask(task),
                              onDelete: () => _deleteTask(task),
                              onEdit: () => TaskDialog.show(context, task: task),
                              onSelectTap: () => _toggleSelected(task.id),
                              onLongPress: () {
                                setState(() {
                                  _selectMode = true;
                                  _selected.add(task.id);
                                });
                              },
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }
}

class _TaskTile extends StatelessWidget {
  final Task task;
  final bool selectMode;
  final bool isSelected;
  final VoidCallback onToggle;
  final VoidCallback onDelete;
  final VoidCallback onEdit;
  final VoidCallback onSelectTap;
  final VoidCallback onLongPress;

  const _TaskTile({
    required this.task,
    required this.selectMode,
    required this.isSelected,
    required this.onToggle,
    required this.onDelete,
    required this.onEdit,
    required this.onSelectTap,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final overdue = isOverdue(task.dueDate, task.completed);

    final tile = Container(
      color: isSelected
          ? Theme.of(context).colorScheme.errorContainer.withValues(alpha: 0.3)
          : null,
      child: ListTile(
        leading: Checkbox(
          value: selectMode ? isSelected : task.completed,
          activeColor: selectMode ? Colors.red : null,
          onChanged: (_) => selectMode ? onSelectTap() : onToggle(),
        ),
        title: Row(
          children: [
            if (task.priority != null) ...[
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: task.priority!.color,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: Text(
                task.title,
                style: TextStyle(
                  decoration: task.completed
                      ? TextDecoration.lineThrough
                      : null,
                  color: task.completed ? Colors.grey : null,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (task.description != null && task.description!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  task.description!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ),
            if (task.dueDate != null || task.priority != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Wrap(
                  spacing: 8,
                  children: [
                    if (task.dueDate != null)
                      Row(
                        mainAxisSize: MainAxisSize.min,
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
                              fontSize: 11,
                              color: overdue ? Colors.red : Colors.grey,
                              fontWeight: overdue ? FontWeight.w600 : null,
                            ),
                          ),
                        ],
                      ),
                    if (task.priority != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 1,
                        ),
                        decoration: BoxDecoration(
                          color: task.priority!.color.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          task.priority!.label.toUpperCase(),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: task.priority!.color,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
        onTap: selectMode ? onSelectTap : onEdit,
        onLongPress: selectMode ? null : onLongPress,
      ),
    );

    if (selectMode) return tile;

    return Dismissible(
      key: ValueKey(task.id),
      direction: DismissDirection.endToStart,
      background: Container(
        color: Colors.red,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: const Icon(Icons.delete, color: Colors.white),
      ),
      onDismissed: (_) => onDelete(),
      child: tile,
    );
  }
}
