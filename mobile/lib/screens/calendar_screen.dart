import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:table_calendar/table_calendar.dart';

import '../main.dart';
import '../models/task.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  final Map<DateTime, List<Task>> _tasksByDay = {};
  DateTime _focusedDay = DateTime.now();
  DateTime? _selectedDay;
  CalendarFormat _format = CalendarFormat.month;
  bool _loading = true;
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _selectedDay = _normalize(DateTime.now());
    _init();
  }

  @override
  void dispose() {
    if (_channel != null) supabase.removeChannel(_channel!);
    super.dispose();
  }

  DateTime _normalize(DateTime d) => DateTime(d.year, d.month, d.day);

  Future<void> _init() async {
    await _fetchTasks();
    _subscribeRealtime();
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _fetchTasks() async {
    final data = await supabase.from('tasks').select();
    if (!mounted) return;
    final List rows = data as List;
    _tasksByDay.clear();
    for (final m in rows) {
      final task = Task.fromMap(m);
      if (task.dueDate == null) continue;
      final key = _normalize(task.dueDate!);
      (_tasksByDay[key] ??= []).add(task);
    }
    setState(() {});
  }

  void _subscribeRealtime() {
    final userId = supabase.auth.currentUser!.id;
    _channel = supabase
        .channel('tasks-calendar')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'tasks',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'user_id',
            value: userId,
          ),
          callback: (_) {
            _fetchTasks();
          },
        )
        .subscribe();
  }

  List<Task> _eventsForDay(DateTime day) {
    return _tasksByDay[_normalize(day)] ?? [];
  }

  Future<void> _openDay(DateTime day) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _DayBottomSheet(
        day: _normalize(day),
        tasks: _eventsForDay(day),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Calendar',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.today),
            tooltip: 'Today',
            onPressed: () {
              final now = DateTime.now();
              setState(() {
                _focusedDay = now;
                _selectedDay = _normalize(now);
              });
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Card(
            margin: const EdgeInsets.all(12),
            child: TableCalendar<Task>(
              firstDay: DateTime.utc(2020, 1, 1),
              lastDay: DateTime.utc(2035, 12, 31),
              focusedDay: _focusedDay,
              selectedDayPredicate: (d) =>
                  _selectedDay != null && isSameDay(_selectedDay, d),
              calendarFormat: _format,
              startingDayOfWeek: StartingDayOfWeek.monday,
              eventLoader: _eventsForDay,
              onDaySelected: (selected, focused) {
                setState(() {
                  _selectedDay = _normalize(selected);
                  _focusedDay = focused;
                });
                _openDay(selected);
              },
              onFormatChanged: (f) => setState(() => _format = f),
              onPageChanged: (focused) => _focusedDay = focused,
              calendarStyle: CalendarStyle(
                todayDecoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary.withOpacity(0.3),
                  shape: BoxShape.circle,
                ),
                selectedDecoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary,
                  shape: BoxShape.circle,
                ),
                markerDecoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary,
                  shape: BoxShape.circle,
                ),
                markersMaxCount: 3,
              ),
              headerStyle: const HeaderStyle(
                formatButtonVisible: true,
                titleCentered: true,
              ),
            ),
          ),
          if (_selectedDay != null)
            Expanded(
              child: _TaskListForDay(
                day: _selectedDay!,
                tasks: _eventsForDay(_selectedDay!),
                onTap: () => _openDay(_selectedDay!),
              ),
            ),
        ],
      ),
    );
  }
}

class _TaskListForDay extends StatelessWidget {
  final DateTime day;
  final List<Task> tasks;
  final VoidCallback onTap;

  const _TaskListForDay({
    required this.day,
    required this.tasks,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${tasks.length} ${tasks.length == 1 ? 'task' : 'tasks'} · ${formatDueDate(day)}',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: Colors.grey,
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: tasks.isEmpty
                ? GestureDetector(
                    onTap: onTap,
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: Colors.grey.withOpacity(0.3),
                          style: BorderStyle.solid,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Center(
                        child: Text(
                          'No tasks. Tap to add one.',
                          style: TextStyle(color: Colors.grey),
                        ),
                      ),
                    ),
                  )
                : ListView.builder(
                    itemCount: tasks.length,
                    itemBuilder: (_, i) {
                      final t = tasks[i];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: Icon(
                            t.completed
                                ? Icons.check_circle
                                : Icons.radio_button_unchecked,
                            color: t.completed
                                ? Colors.green
                                : Theme.of(context).colorScheme.primary,
                          ),
                          title: Text(
                            t.title,
                            style: TextStyle(
                              decoration: t.completed
                                  ? TextDecoration.lineThrough
                                  : null,
                              color: t.completed ? Colors.grey : null,
                            ),
                          ),
                          onTap: onTap,
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

class _DayBottomSheet extends StatefulWidget {
  final DateTime day;
  final List<Task> tasks;

  const _DayBottomSheet({required this.day, required this.tasks});

  @override
  State<_DayBottomSheet> createState() => _DayBottomSheetState();
}

class _DayBottomSheetState extends State<_DayBottomSheet> {
  final _titleCtrl = TextEditingController();

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final title = _titleCtrl.text.trim();
    if (title.isEmpty) return;
    final userId = supabase.auth.currentUser!.id;
    try {
      await supabase.from('tasks').insert({
        'title': title,
        'user_id': userId,
        'due_date': Task.formatIso(widget.day),
      });
      _titleCtrl.clear();
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _toggle(Task t) async {
    await supabase
        .from('tasks')
        .update({'completed': !t.completed})
        .eq('id', t.id);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _delete(Task t) async {
    await supabase.from('tasks').delete().eq('id', t.id);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottomInset + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: Colors.grey.withOpacity(0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Text(
            formatDueDate(widget.day),
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          Text(
            '${widget.tasks.length} ${widget.tasks.length == 1 ? 'task' : 'tasks'}',
            style: const TextStyle(color: Colors.grey),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _titleCtrl,
                  decoration: const InputDecoration(
                    hintText: 'Add a task for this day…',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _add(),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _add,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 16,
                  ),
                ),
                child: const Text('Add'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (widget.tasks.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text(
                  'No tasks for this day.',
                  style: TextStyle(color: Colors.grey),
                ),
              ),
            )
          else
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.4,
              ),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: widget.tasks.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final t = widget.tasks[i];
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Checkbox(
                      value: t.completed,
                      onChanged: (_) => _toggle(t),
                    ),
                    title: Text(
                      t.title,
                      style: TextStyle(
                        decoration: t.completed
                            ? TextDecoration.lineThrough
                            : null,
                        color: t.completed ? Colors.grey : null,
                      ),
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline, size: 20),
                      onPressed: () => _delete(t),
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
