listen 5001 # by default Unicorn listens on port 8080
worker_processes 2 # this should be >= nr_cpus
pid "/home/crporter/workspace/graphiti/unicorn/unicorn.pid"
stderr_path "/home/crporter/workspace/graphiti/unicorn/unicorn.log"
stdout_path "/home/crporter/workspace/graphiti/unicorn/unicorn.log"
