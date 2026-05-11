import 'dart:convert';
import 'package:http/http.dart' as http;

import '../models/task.dart';

const String _planEndpoint = 'https://dayplan-murex.vercel.app/api/plan';

class SuggestedTask {
  final String title;
  final String? description;
  final DateTime? dueDate;
  final Priority? priority;

  SuggestedTask({
    required this.title,
    this.description,
    this.dueDate,
    this.priority,
  });

  factory SuggestedTask.fromJson(Map<String, dynamic> j) {
    return SuggestedTask(
      title: j['title'] as String,
      description: j['description'] as String?,
      dueDate: j['due_date'] != null
          ? DateTime.parse(j['due_date'] as String)
          : null,
      priority: PriorityX.fromString(j['priority'] as String?),
    );
  }

  Map<String, dynamic> toInsertRow(String userId) => {
        'user_id': userId,
        'title': title,
        'description': description,
        'due_date': dueDate != null ? Task.formatIso(dueDate!) : null,
        'priority': priority?.value,
      };
}

Future<List<SuggestedTask>> generatePlan(String prompt) async {
  final res = await http.post(
    Uri.parse(_planEndpoint),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'prompt': prompt}),
  );

  if (res.statusCode != 200) {
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    throw Exception(body['error'] ?? 'Failed to generate plan');
  }

  final data = jsonDecode(res.body) as Map<String, dynamic>;
  final tasks = (data['tasks'] as List)
      .map((t) => SuggestedTask.fromJson(t as Map<String, dynamic>))
      .toList();
  return tasks;
}
