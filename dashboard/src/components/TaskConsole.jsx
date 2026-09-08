import React, { useState } from 'react';

const TaskConsole = ({ tasks }) => {
  const [selectedTask, setSelectedTask] = useState(null);

  if (!tasks || tasks.length === 0) {
    return (
      <div className="bg-black border border-green-500/30 p-4 rounded-lg font-mono text-green-500 text-sm">
        <div className="animate-pulse">Waiting for agent activity...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black border border-green-500/30 rounded-lg overflow-hidden font-mono">
      <div className="bg-green-500/10 border-b border-green-500/30 px-4 py-2 text-green-500 text-xs font-bold uppercase tracking-widest">
        Agent Execution Console
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Task List */}
        <div className="w-1/3 border-r border-green-500/30 overflow-y-auto max-h-[400px]">
          {tasks.map((task, i) => (
            <div 
              key={task.id} 
              onClick={() => setSelectedTask(task)}
              className={`cursor-pointer p-2 text-xs border-b border-green-500/10 hover:bg-green-500/10 transition-colors ${selectedTask?.id === task.id ? 'bg-green-500/20 text-green-400' : 'text-green-600'}`}
            >
              <div className="flex justify-between mb-1">
                <span className="font-bold uppercase">{task.agent}</span>
                <span className="opacity-50">{task.status}</span>
              </div>
              <div className="truncate opacity-80">{task.command}</div>
            </div>
          ))}
        </div>

        {/* Detail View */}
        <div className="w-2/3 p-4 bg-black/50 overflow-y-auto max-h-[400px]">
          {selectedTask ? (
            <div className="text-sm">
              <div className="flex justify-between items-center mb-4 border-b border-green-500/30 pb-2">
                <span className="text-green-400 font-bold">TASK_ID: {selectedTask.id}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] ${selectedTask.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {selectedTask.status}
                </span>
              </div>
              <div className="mb-4">
                <div className="text-green-700 text-xs uppercase mb-1">Command:</div>
                <div className="text-green-300 bg-green-500/5 p-2 rounded border border-green-500/20">
                  {selectedTask.command}
                </div>
              </div>
              <div>
                <div className="text-green-700 text-xs uppercase mb-1">Output:</div>
                <div className="text-green-400 bg-black p-2 rounded border border-green-500/20 whitespace-pre-wrap">
                  {selectedTask.result || 'No output received...'}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-green-800 italic text-sm">
              Select a task from the left to view output
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskConsole;
