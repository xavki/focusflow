import 'package:flutter/material.dart';

enum Priority { low, medium, high }

extension PriorityX on Priority {
  String get label {
    switch (this) {
      case Priority.low:
        return 'Low';
      case Priority.medium:
        return 'Medium';
      case Priority.high:
        return 'High';
    }
  }

  String get value {
    switch (this) {
      case Priority.low:
        return 'low';
      case Priority.medium:
        return 'medium';
      case Priority.high:
        return 'high';
    }
  }

  Color get color {
    switch (this) {
      case Priority.low:
        return const Color(0xFF0EA5E9);
      case Priority.medium:
        return const Color(0xFFF59E0B);
      case Priority.high:
        return const Color(0xFFEF4444);
    }
  }

  static Priority? fromString(String? s) {
    switch (s) {
      case 'low':
        return Priority.low;
      case 'medium':
        return Priority.medium;
      case 'high':
        return Priority.high;
      default:
        return null;
    }
  }
}

class Task {
  final String id;
  final String userId;
  final String title;
  final String? description;
  final Priority? priority;
  final bool completed;
  final DateTime? dueDate;
  final DateTime createdAt;

  Task({
    required this.id,
    required this.userId,
    required this.title,
    required this.description,
    required this.priority,
    required this.completed,
    required this.dueDate,
    required this.createdAt,
  });

  factory Task.fromMap(Map<String, dynamic> map) {
    return Task(
      id: map['id'] as String,
      userId: map['user_id'] as String,
      title: map['title'] as String,
      description: map['description'] as String?,
      priority: PriorityX.fromString(map['priority'] as String?),
      completed: map['completed'] as bool,
      dueDate: map['due_date'] != null
          ? DateTime.parse(map['due_date'] as String)
          : null,
      createdAt: DateTime.parse(map['created_at'] as String),
    );
  }

  static String formatIso(DateTime d) {
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$m-$day';
  }
}

enum TaskFilter { all, today, week, noDate }

extension TaskFilterLabel on TaskFilter {
  String get label {
    switch (this) {
      case TaskFilter.all:
        return 'All';
      case TaskFilter.today:
        return 'Today';
      case TaskFilter.week:
        return 'This week';
      case TaskFilter.noDate:
        return 'No date';
    }
  }
}

String formatDueDate(DateTime? d) {
  if (d == null) return '';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final tomorrow = today.add(const Duration(days: 1));
  final target = DateTime(d.year, d.month, d.day);
  if (target == today) return 'Today';
  if (target == tomorrow) return 'Tomorrow';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${months[d.month - 1]} ${d.day}';
}

bool isOverdue(DateTime? d, bool completed) {
  if (d == null || completed) return false;
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final target = DateTime(d.year, d.month, d.day);
  return target.isBefore(today);
}
