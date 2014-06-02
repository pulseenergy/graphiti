# A sample Gemfile
source 'https://rubygems.org'

gem 'rake'
gem 'rack'
gem 'eventmachine', "1.0.3"
gem 'sinatra'
gem 'sinatra-contrib'
gem 'jim'
gem 'closure-compiler'
gem 'redis'
gem 'redised'
gem 'compass'
gem 'haml'
gem 'typhoeus'
gem 'yajl-ruby'
gem 'pony'
gem 'nokogiri'
gem 'rspec', :require => 'spec'

group :test do
  gem 'minitest', :require => false
  gem 'minitest-display', :require => false
end

group :development do
  gem 'sinatra-reloader', :require => 'sinatra/reloader'
  gem 'thin', '1.6.2'
  gem 'ruby-debug19'
end

group :production do
  gem 'unicorn'
end
