import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:table_calendar/table_calendar.dart';

import '../main.dart';
import '../models/task.dart';
import '../widgets/task_dialog.dart';

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
          callback: (_) => _fetchTasks(),
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
          ValueListenableBuilder<ThemeMode>(
            valueListenable: themeMode,
            builder: (_, mode, __) => IconButton(
              icon: Icon(themeIcon(mode)),
              tooltip: 'Theme: ${mode.name}',
              onPressed: toggleTheme,
            ),
          ),
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
              calendarBuilders: CalendarBuilders(
                markerBuilder: (context, day, events) {
                  if (events.isEmpty) return null;
                  final colors = <Color>{};
                  for (final t in events) {
                    if (t.priority != null) colors.add(t.priority!.color);
                  }
                  if (colors.isEmpty) {
                    colors.add(Theme.of(context).colorScheme.primary);
                  }
                  return Positioned(
                    bottom: 4,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: colors
                          .take(3)
                          .map(
                            (c) => Container(
                              margin: const EdgeInsets.symmetric(horizontal: 1),
                              width: 6,
                              height: 6,
                              decoration: BoxDecoration(
                                color: c,
                                shape: BoxShape.circle,
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  );
                },
              ),
              calendarStyle: CalendarStyle(
                todayDecoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.3),
                  shape: BoxShape.circle,
                ),
                selectedDecoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary,
                  shape: BoxShape.circle,
                ),
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
                          color: Colors.grey.withValues(alpha: 0.3),
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
                          title: Row(
                            children: [
                              if (t.priority != null) ...[
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(
                                    color: t.priority!.color,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 8),
                              ],
                              Expanded(
                                child: Text(
                                  t.title,
                                  style: TextStyle(
                                    decoration: t.completed
                                        ? TextDecoration.lineThrough
                                        : null,
                                    color: t.completed ? Colors.grey : null,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          subtitle: t.description != null && t.description!.isNotEmpty
                              ? Text(
                                  t.description!,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 12),
                                )
                              : null,
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

class _DayBottomSheet extends StatelessWidget {
  final DateTime day;
  final List<Task> tasks;

  const _DayBottomSheet({required this.day, required this.tasks});

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottomInset + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: Colors.grey.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      formatDueDate(day),
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    Text(
                      '${tasks.length} ${tasks.length == 1 ? 'task' : 'tasks'}',
                      style: const TextStyle(color: Colors.grey),
                    ),
                  ],
                ),
              ),
              FilledButton.icon(
                onPressed: () {
                  Navigator.of(context).pop();
                  TaskDialog.show(context, defaultDate: day);
                },
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (tasks.isEmpty)
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
                itemCount: tasks.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final t = tasks[i];
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Checkbox(
                      value: t.completed,
                      onChanged: (_) async {
                        await supabase
                            .from('tasks')
                            .update({'completed': !t.completed})
                            .eq('id', t.id);
                        if (context.mounted) Navigator.of(context).pop();
                      },
                    ),
                    title: Row(
                      children: [
                        if (t.priority != null) ...[
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: t.priority!.color,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                        Expanded(
                          child: Text(
                            t.title,
                            style: TextStyle(
                              decoration: t.completed
                                  ? TextDecoration.lineThrough
                                  : null,
                              color: t.completed ? Colors.grey : null,
                            ),
                          ),
                        ),
                      ],
                    ),
                    subtitle: t.description != null && t.description!.isNotEmpty
                        ? Text(
                            t.description!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          )
                        : null,
                    onTap: () {
                      Navigator.of(context).pop();
                      TaskDialog.show(context, task: t);
                    },
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline, size: 20),
                      onPressed: () async {
                        await supabase.from('tasks').delete().eq('id', t.id);
                        if (context.mounted) Navigator.of(context).pop();
                      },
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
